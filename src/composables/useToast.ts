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
  // Bumped by every setToast/clearToast so in-flight setToast calls know they were superseded
  let toastId = 0

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
    // Claim ownership before awaiting: otherwise overlapping calls each create a toast and
    // the one that loses the assignment (possibly a keepOpen spinner) is never dismissed.
    const previousCleared = clearToast()
    const id = ++toastId
    toastMessage.value = message

    if (type === 'error')
      logger.error(message)
    else logger.log(message)

    await previousCleared
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
    if (id !== toastId) {
      // Never presented, so dismiss() would be a no-op and leave the element in the DOM
      newToast.remove()
      return
    }
    toast.value = newToast
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
      presentPromise = null
    }
    if (id === toastId)
      toastMessage.value = ''
  }

  // With `message`, only clears if that toast is still the current one (shown or pending)
  async function clearToast(message?: string) {
    if (message !== undefined && message !== toastMessage.value)
      return
    toastId++
    toastMessage.value = ''
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
