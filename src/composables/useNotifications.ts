// TODO: https://capacitorjs.com/docs/apis/background-runner
// TODO: https://capacitorjs.com/docs/apis/local-notifications

/* eslint-disable no-console */
import { type Ref, ref } from 'vue'
import { type ActionPerformed, PushNotifications } from '@capacitor/push-notifications'
import type { PermissionState } from '@capacitor/core'
import { i18n } from '@/i18n/i18n-setup'
import { Modal, useModal } from '@/composables/useModal'
import { useDevice } from '@/composables/useDevice'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'

type Action = 'openPoints' | 'openTask'
interface NotificationData {
  action?: Action
  task_id?: string
}

const { isAndroid, isIOS, isWeb } = useDevice()

export function useNotifications() {
  const status: Ref<PermissionState | undefined> = ref()

  async function init() {
    if (isWeb)
      return
    status.value = (await PushNotifications.checkPermissions()).receive
    await addListeners()
    if (status.value === 'granted')
      await registerNotifications()
  }

  async function addListeners() {
    await PushNotifications.addListener('registration', (token) => {
      console.log('🔔 Registration token:', token.value)
    })

    await PushNotifications.addListener('registrationError', (err) => {
      console.error('🔔 Registration error:', err.error)
    })

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('🔔 Push notification received:', notification)
    })

    await PushNotifications.addListener('pushNotificationActionPerformed', performAction)
  }

  async function registerNotifications() {
    if (isWeb)
      return true

    if (status.value === 'prompt' || status.value === 'prompt-with-rationale' || (!status.value && isIOS))
      status.value = (await PushNotifications.requestPermissions()).receive

    if (status.value === 'denied') {
      console.error('🔔🚫 User denied permissions!')
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
      console.log('🔔 Registered for push notifications', status.value)
    }
    catch (e) {
      console.error('🔔 Error registering for push notifications', e)
      return false
    }
    return true
  }

  async function getDeliveredNotifications() {
    const notificationList = await PushNotifications.getDeliveredNotifications()
    console.log('🔔 Delivered notifications', notificationList)
  }

  async function performAction(notification: ActionPerformed) {
    const { actionId, notification: { data } } = notification
    const { action, task_id } = data as NotificationData
    if (actionId !== 'tap' || !action)
      return

    console.log('🔔 ⚡ Performing action', action, task_id ?? '', notification)
    const { waitForUnlock } = (await import('@/stores/conn')).useConn()
    await waitForUnlock()
    const { phoneNumberVerified } = (await import('@/stores/app')).useApp()

    if (action === 'openPoints') { useModal().showModal(Modal.Points) }
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
      console.error(error)
      return
    }

    useModal().showModal(Modal.Task, { isOnTop: true, componentProps: { task } })
  }

  return {
    init,
    status,
    addListeners,
    registerNotifications,
    getDeliveredNotifications,
  }
}
