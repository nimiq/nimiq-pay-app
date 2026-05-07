import { Haptics, NotificationType } from '@capacitor/haptics'
import { toastController } from '@ionic/vue'
import { createSharedComposable } from '@vueuse/core'
import { ref } from 'vue'
import { toastError, toastSpinner, toastSuccess, toastWarning } from '@/components/icons'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('useToast.ts')

function _useToast() {
  const toast = ref<HTMLIonToastElement | null>(null)
  const toastMessage = ref('')
  let presentPromise: Promise<void> | null = null

  // FIXME: animation not working
  // const enterAnimation = (baseEl: HTMLElement) => {
  //   const root = baseEl.shadowRoot
  //   const slideAnimation = createAnimation().addElement(root!.querySelector('.notification-alert-toast')!).fromTo('transform', 'translateY(-100%)', 'translateY(0)')

  //   return createAnimation()
  //     .addElement(baseEl)
  //     .duration(500)
  //     .addAnimation(slideAnimation)
  // }

  async function setToast({ message, type = 'success', keepOpen, duration = 3 * 1e3 }: Toast) {
    // Prevent showing the same toast multiple times
    if (message === toastMessage.value)
      return
    await clearToast()

    if (type === 'error')
      logger.error(message)
    else logger.log(message)

    const newToast = await toastController.create({
      message,
      duration: keepOpen ? undefined : duration,
      icon: {
        success: toastSuccess,
        warning: toastWarning,
        error: toastError,
        spinner: toastSpinner,
      }[type],
      cssClass: 'notification-alert-toast',
      position: 'top',
      swipeGesture: 'vertical',
      // animated: true,
      // enterAnimation,
    })
    toast.value = newToast
    toastMessage.value = message
    presentPromise = newToast.present()

    const hapticType = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error,
      spinner: undefined,
    }[type]
    if (hapticType)
      Haptics.notification({ type: hapticType })

    await newToast.onDidDismiss()
    if (toast.value === newToast) {
      toast.value = null
      toastMessage.value = ''
      presentPromise = null
    }
  }

  async function clearToast() {
    const t = toast.value
    if (!t)
      return
    // Wait for present() to finish before dismissing. Without this, dismiss()
    // called mid-present is dropped on iOS and the toast lingers.
    if (presentPromise) {
      try {
        await presentPromise
      }
      catch { /* present rejection is non-fatal for dismissal */ }
    }
    await t.dismiss()
  }

  return {
    toast,
    setToast,
    clearToast,
  }
}

export const useToast = createSharedComposable(_useToast)
