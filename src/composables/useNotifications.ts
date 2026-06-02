// TODO: https://capacitorjs.com/docs/apis/background-runner

import type { PermissionState } from '@capacitor/core'
import type { ActionPerformed } from '@capacitor/push-notifications'
import type { Ref } from 'vue'
import type { NotificationRes } from '@/composables/useApi'
import type { UserReceiptTransaction } from '@/types/transactions'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { InAppBrowser } from '@capgo/capacitor-inappbrowser'
import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useNotificationsApi } from '@/composables/useApi'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { usePrice } from '@/composables/usePrice'
import { i18n } from '@/i18n/i18n-setup'
import { Asset, formatUsdtAmount } from '@/lib/assets'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { LocalNotificationsStatus, PushNotificationsStatus, useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocks } from '@/stores/locks'
import { useTransactions } from '@/stores/transactions'

const logger = useLogger('useNotifications')
const { getRemoteNotifications } = useNotificationsApi()

type Action = 'openPoints' | 'openTask' | 'initializeFlow'
interface NotificationData {
  action?: Action
  task_id?: string
}

interface LocalNotification {
  id: string
  title: string
  subtitle?: string | undefined
  action?: (() => void) | undefined
}

/**
 * @description List of local notifications to show to the user
 * @property {string} id - Unique identifier for the notification, can be used to remove it. It needs to be unique for each notification
 * @property {string} title - The title of the notification
 * @property {string} subtitle - The subtitle of the notification
 * @property {() => void} action - The action to perform when the notification is clicked
 */
const localNotificationsArray: Ref<LocalNotification[]> = ref([
  // {
  //   id: 'beta-message',
  //   get title() { return i18n.t('Beta Testing') },
  //   get subtitle() { return i18n.t('This is an early beta version, please report any bugs and remember to backup your words') },
  //   action: () => logger.log('Notification Card 2 clicked'),
  // },
  // {
  //   id: 'welcome-message',
  //   get title() { return i18n.t('Welcome to Nimiq Pay') },
  //   get subtitle() { return i18n.t('Your wallet is ready to use') },
  //   // action: () => initializeFlow(FlowName.OnBoardingPoints),
  // },
])

export function useNotifications() {
  const status: Ref<PermissionState | undefined> = ref()
  const { isAndroid, isWeb } = useDevice()
  const isStatusGranted = computedAsync(async () => isWeb ? false : (await PushNotifications.checkPermissions()).receive === 'granted')
  const { closedNotifications, pushNotificationsStatus } = storeToRefs(useApp())

  async function init() {
    getRemoteNotifications()
      .then((res) => {
        const { data: notifications, error } = res
        if (error) {
          logger.error('Error getting remote notifications', error)
          return
        }
        if (!notifications)
          return
        notifications.forEach((notification) => {
          if (!notification.display)
            return
          const action = getActionFromNotification(notification)
          const localNotification = {
            id: `${notification.id}-${notification.title.toLowerCase().replace(/\s/g, '-')}`,
            title: notification.title,
            subtitle: notification.subtitle,
            action,
          }
          addLocalNotification(localNotification, true)
        })
      })
      .catch(e => logger.error('Error getting remote notifications', e))

    if (isWeb)
      return

    logger.log('🔔 Notification init', pushNotificationsStatus.value)
    if (pushNotificationsStatus.value === PushNotificationsStatus.DENIED)
      return

    status.value = (await PushNotifications.checkPermissions()).receive
    logger.log('🔔 Notification init, Permissions status:', status.value)
    if (status.value === 'granted')
      await registerNotifications()
  }

  async function addListeners() {
    await PushNotifications.addListener('registration', (token) => {
      logger.log('🔔 Registration token:', token.value)
    })

    await PushNotifications.addListener('registrationError', (err) => {
      logger.error('🔔 Registration error:', err.error)
    })

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      logger.log('🔔 Push notification received:', notification)
    })

    await PushNotifications.addListener('pushNotificationActionPerformed', performAction)
  }

  async function registerNotifications() {
    if (isWeb)
      return true

    if (status.value === 'prompt' || status.value === 'prompt-with-rationale' || !status.value)
      status.value = (await PushNotifications.requestPermissions()).receive

    if (status.value === 'denied') {
      logger.error('🔔🚫 User denied permissions!')
      pushNotificationsStatus.value = PushNotificationsStatus.DENIED
      return false
    }

    await addListeners()
    try {
      await PushNotifications.register()
      // Channels are only available on Android
      if (isAndroid) {
        await PushNotifications.createChannel({
          id: 'rewards',
          name: i18n.t('Rewards Notifications'),
          description: i18n.t('Notifications about new campaigns and other important events'),
          // TODO: custom sound
          // sound: 'custom-sound.wav',
          visibility: 1,
          lights: true,
          vibration: true,
        })
      }
      logger.log('🔔 Registered for push notifications', status.value)
      pushNotificationsStatus.value = PushNotificationsStatus.GRANTED
    }
    catch (e) {
      logger.error('🔔 Error registering for push notifications', e)
      pushNotificationsStatus.value = PushNotificationsStatus.PROMPT
      return false
    }
    return true
  }

  async function unregisterNotifications() {
    if (isWeb)
      return

    pushNotificationsStatus.value = PushNotificationsStatus.DENIED
    try {
      await PushNotifications.unregister()
      await PushNotifications.removeAllListeners()
      logger.log('🔔 Unregistered from push notifications')
    }
    catch (e) {
      logger.error('🔔 Error unregistering from push notifications', e)
    }
  }

  async function getDeliveredNotifications() {
    const notificationList = await PushNotifications.getDeliveredNotifications()
    logger.log('🔔 Delivered notifications', notificationList)
  }

  const POINTS_PUSH_ANALYTICS = { featureName: 'points', source: 'push_notification' } as const

  async function performAction(notification: ActionPerformed) {
    const { actionId, notification: { data } } = notification
    const { action, task_id } = data as NotificationData
    if (actionId !== 'tap' || !action)
      return

    logger.log('🔔 ⚡ Performing action', action, task_id ?? '', notification)
    const { waitForUnlock } = (await import('@/stores/conn')).useConn()
    await waitForUnlock()
    const { phoneNumberVerified } = (await import('@/stores/app')).useApp()

    if (action === 'openPoints') {
      useModal().showModal(Modal.Points, { analytics: POINTS_PUSH_ANALYTICS })
    }
    else if (action === 'openTask' && task_id) {
      if (phoneNumberVerified)
        openTask(task_id)
      else
        initializeFlow(FlowName.VerifyPhone, { analyticsSource: 'push_notification_task' })
    }
  }

  async function openTask(task_id: string) {
    const { data: task, error } = await (await import('@/stores/points')).usePoints().getTaskById(task_id)
    // TODO: show error
    if (error) {
      logger.error(error)
      return
    }

    useModal().showModal(Modal.Task, { isOnTop: true, componentProps: { task } })
  }

  function getActionFromNotification(notification: NotificationRes) {
    if (!notification.action)
      return

    const { action, actionExtra } = notification
    if (action === 'openPoints') {
      return () => useModal().showModal(Modal.Points, { analytics: POINTS_PUSH_ANALYTICS })
    }
    if (action === 'openTask' && actionExtra)
      return () => openTask(actionExtra)
    if (action === 'initializeFlow' && actionExtra)
      return () => initializeFlow(actionExtra as FlowName)

    return undefined
  }

  function addLocalNotification(notification: LocalNotification, unshift = false) {
    if (localNotificationsArray.value.some(n => n.id === notification.id))
      return
    if (unshift)
      localNotificationsArray.value.unshift(notification)
    else
      localNotificationsArray.value.push(notification)
  }

  function removeLocalNotification(id: string, permanent = true) {
    localNotificationsArray.value = localNotificationsArray.value.filter(n => n.id !== id)

    if (permanent)
      closedNotifications.value.push(id)
  }

  const { localNotificationsStatus } = storeToRefs(useApp())

  // Android 8+ requires notifications to be assigned to a channel. Default
  // channel importance is `DEFAULT` (3), which shows the icon in the status bar
  // but NOT as a heads-up banner. To get the banner we create a dedicated
  // channel with `importance: 5` (MAX) and reference its id in every
  // `LocalNotifications.schedule` call below. Channel properties are immutable
  // post-creation on Android 8+, so the id is fixed.
  const PAYMENTS_CHANNEL_ID = 'incoming-payments'
  let paymentsChannelEnsured: Promise<void> | null = null
  async function ensurePaymentsChannel() {
    if (isWeb || !isAndroid)
      return
    if (paymentsChannelEnsured)
      return paymentsChannelEnsured
    paymentsChannelEnsured = (async () => {
      try {
        await LocalNotifications.createChannel({
          id: PAYMENTS_CHANNEL_ID,
          name: i18n.t('Incoming Payments'),
          description: i18n.t('Notification when a payment arrives'),
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
        })
      }
      catch (err) {
        logger.error('🔔 Failed to create incoming-payments channel', err)
        paymentsChannelEnsured = null
      }
    })()
    return paymentsChannelEnsured
  }

  async function requestLocalNotificationsPermission() {
    if (isWeb)
      return
    const current = (await LocalNotifications.checkPermissions()).display
    const next = current === 'granted'
      ? 'granted'
      : (await LocalNotifications.requestPermissions()).display
    localNotificationsStatus.value = next === 'granted'
      ? LocalNotificationsStatus.GRANTED
      : LocalNotificationsStatus.DENIED
    logger.log('🔔 Local notifications permission:', next)
    if (next === 'granted')
      await ensurePaymentsChannel()
  }

  async function scheduleIncomingPaymentNotification(tx: UserReceiptTransaction) {
    if (isWeb)
      return
    if (localNotificationsStatus.value !== LocalNotificationsStatus.GRANTED) {
      // Local notifications were added after the push permission flow shipped, so
      // existing users may have granted push but never been asked for local. Ask now;
      // they can still deny.
      await requestLocalNotificationsPermission()
      // @ts-expect-error - status can change after the await
      if (localNotificationsStatus.value !== LocalNotificationsStatus.GRANTED) {
        logger.log('🔔 Cannot schedule incoming payment notification, permission not granted')
        return
      }
    }
    if (useLocks().isHomeVisible)
      return
    if (useConn().locked)
      return

    const formatted = tx.asset === Asset.USDT
      ? formatUsdtAmount(tx.amount)
      : usePrice(tx.amount).crypto.formatted

    try {
      await ensurePaymentsChannel()
      await LocalNotifications.schedule({
        notifications: [{
          id: hashToInt32(tx.hash),
          title: i18n.t('Payment received'),
          body: i18n.t('You received {amount}', { amount: formatted }),
          extra: { hash: tx.hash },
          channelId: PAYMENTS_CHANNEL_ID,
        }],
      })
      logger.log('🔔 Local notification scheduled for incoming payment', { hash: tx.hash, amount: formatted })
    }
    catch (err) {
      logger.error('🔔 Failed to schedule local notification', err)
    }
  }

  let tapHandle: { remove: () => Promise<void> } | null = null
  async function installLocalNotificationsTapHandler() {
    if (isWeb || tapHandle)
      return
    const { waitForUnlock } = useConn()
    const transactionsStore = useTransactions()
    tapHandle = await LocalNotifications.addListener('localNotificationActionPerformed', async (event) => {
      const hash = (event.notification?.extra as { hash?: string } | undefined)?.hash
      if (!hash) {
        logger.log('🔔 Local notification tapped without hash extra, ignoring')
        return
      }
      logger.log('🔔 Local notification tapped, opening tx detail', { hash })
      await waitForUnlock()
      const tx = transactionsStore.transactions.find(t => t.hash === hash)
      if (!tx) {
        logger.log('🔔 Tx hash not found in store, cannot open detail', { hash })
        return
      }
      try {
        await InAppBrowser.close()
      }
      catch {}
      initializeFlow(FlowName.ViewTransactionDetail, { initialState: { transactionList: tx } })
    })
  }

  return {
    init,
    status,
    isStatusGranted,
    addListeners,
    registerNotifications,
    unregisterNotifications,
    getDeliveredNotifications,
    localNotifications: computed(() => localNotificationsArray.value.filter(n => !closedNotifications.value.includes(n.id))),
    addLocalNotification,
    removeLocalNotification,
    requestLocalNotificationsPermission,
    scheduleIncomingPaymentNotification,
    installLocalNotificationsTapHandler,
  }
}

// djb2-style 31-bit positive hash; LocalNotifications id field is a 32-bit int.
// Deterministic per tx-hash so a duplicate fire (e.g. resync) overwrites the same notif slot.
function hashToInt32(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++)
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  return Math.abs(h) || 1
}
