import { toastController } from '@ionic/vue'
import { ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { useLogger } from './useLogger'
import { toastError, toastSpinner, toastSuccess, toastWarning } from '@/components/icons'

const logger = useLogger('useToast.ts')

function _useToast() {
  const toast = ref<HTMLIonToastElement | null>(null)

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
    clearToast()

    if (type === 'error')
      logger.error(message)
    else logger.log(message)

    toast.value = await toastController.create({
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
    toast.value.present()
  }

  function clearToast() {
    toast.value?.dismiss()
    toast.value = null
  }

  return {
    toast,
    setToast,
    clearToast,
  }
}

export const useToast = createSharedComposable(_useToast)
