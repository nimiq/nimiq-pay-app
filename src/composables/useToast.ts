import { toastController } from '@ionic/vue'
import { ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { check, xmark } from '@/components/icons'

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

  async function setToast({ message, error, keepOpen, duration = 3 * 1e3 }: Toast) {
    clearToast()

    toast.value = await toastController.create({
      message,
      duration: keepOpen ? undefined : duration,
      icon: error ? xmark : check,
      cssClass: `notification-alert-toast ${error && 'toast-error'}`,
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
