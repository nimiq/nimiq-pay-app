import { storeToRefs } from 'pinia'

// TODO: https://capacitorjs.com/docs/apis/background-runner
// TODO: https://capacitorjs.com/docs/apis/local-notifications

import { type Ref, computed, ref } from 'vue'
import { type ActionPerformed, PushNotifications } from '@capacitor/push-notifications'
import type { PermissionState } from '@capacitor/core'
import { i18n } from '@/i18n/i18n-setup'
import { Modal, useModal } from '@/composables/useModal'
import { useDevice } from '@/composables/useDevice'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useLogger } from '@/composables/useLogger'
import { useApp } from '@/stores/app'

const logger = useLogger('useNotifications')

type Action = 'openPoints' | 'openTask'
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

// TODO: get this from a server
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
  {
    id: 'welcome-message',
    get title() { return i18n.t('Welcome to Nimiq Pay') },
    get subtitle() { return i18n.t('Your wallet is ready to use') },
    // action: () => initializeFlow(FlowName.OnBoardingPoints),
  },
])

export function useNotifications() {
  const status: Ref<PermissionState | undefined> = ref()
  const { isAndroid, isWeb } = useDevice()
  const { closedNotifications } = storeToRefs(useApp())

  async function init() {
    if (isWeb)
      return
    status.value = (await PushNotifications.checkPermissions()).receive
    logger.log('🔔 Notification init, Permissions status:', status.value)
    await addListeners()
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
      return false
    }

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
    }
    catch (e) {
      logger.error('🔔 Error registering for push notifications', e)
      return false
    }
    return true
  }

  async function getDeliveredNotifications() {
    const notificationList = await PushNotifications.getDeliveredNotifications()
    logger.log('🔔 Delivered notifications', notificationList)
  }

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
      useModal().showModal(Modal.Points)
    }
    else if (action === 'openTask' && task_id) {
      if (phoneNumberVerified)
        openTask(task_id)
      else
        initializeFlow(FlowName.VerifyPhone)
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

  function addLocalNotification(notification: LocalNotification, unshift = false) {
    if (localNotificationsArray.value.some(n => n.id === notification.id))
      return
    if (unshift)
      localNotificationsArray.value.unshift(notification)
    else
      localNotificationsArray.value.push(notification)
  }

  function removeLocalNotification(id: string) {
    closedNotifications.value.push(id)
  }

  return {
    init,
    status,
    addListeners,
    registerNotifications,
    getDeliveredNotifications,
    localNotifications: computed(() => localNotificationsArray.value.filter(n => !closedNotifications.value.includes(n.id))),
    addLocalNotification,
    removeLocalNotification,
  }
}
