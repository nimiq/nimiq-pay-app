import { ref } from 'vue'
import type { Ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { modalController } from '@ionic/vue'
import type { ComponentRef } from '@ionic/core'

import PinChooseModal from '@/modals/PinChooseModal.vue'
import PromoCodeModal from '@/modals/PromoCodeModal.vue'
import PhoneNumberModal from '@/modals/PhoneNumberModal/index.vue'
import PushNotificationEnableModal from '@/modals/PushNotificationEnableModal.vue'
import RewardsIntroModal from '@/modals/RewardsIntroModal/index.vue'

export enum ModalType {
  EnablePushNotifications,
  Login,
  NewPin,
  NewPhone,
  PromoCode,
  VerifyPhone,
  RewardsIntro,
}

const activeModal = ref<HTMLIonModalElement | null>(null)

function _useModal() {
  const isPresent = ref(false)

  async function showModal(modal: ModalType) {
    if (import.meta.env.MODE === 'development') {
      // eslint-disable-next-line no-console
      console.log('showModal', modal)
    }

    let component: ComponentRef = null
    if (activeModal.value) {
      await closeModal()
      component = null
    }

    switch (modal) {
      case ModalType.NewPin:
        component = PinChooseModal
        break
      case ModalType.NewPhone:
        component = PhoneNumberModal
        break
      case ModalType.PromoCode:
        component = PromoCodeModal
        break
      case ModalType.EnablePushNotifications:
        component = PushNotificationEnableModal
        break
      case ModalType.RewardsIntro:
        component = RewardsIntroModal
        break
    }
    if (component) {
      activeModal.value = await modalController.create({
        component,
        handle: false,
        // canDismiss: async (data?: any, role?: string) => role !== 'gesture' || !ModalType.RewardsIntro,
        canDismiss: true,
        initialBreakpoint: 1,
        breakpoints: [0, 1],
      })
      activeModal.value.addEventListener('did-present', () => {
        isPresent.value = true
      })
      activeModal.value.addEventListener('will-dismiss', () => {
        isPresent.value = false
      })
      await activeModal.value.present()
    }
  }

  async function showNotificationAlert(modalRef: Ref<{ $el: HTMLIonModalElement } | undefined>) {
    return new Promise<void>((resolve) => {
      const modal = modalRef.value?.$el
      if (!modal)
        return
      if (import.meta.env.MODE === 'development') {
      // eslint-disable-next-line no-console
        console.log('showNotificationAlert')
      }
      modal.present()
      setTimeout(() => {
        modal.dismiss()
        resolve()
      }, 2000)
    })
  }

  async function closeModal() {
    if (import.meta.env.MODE === 'development') {
      // eslint-disable-next-line no-console
      console.log('closeModal')
    }

    if (activeModal.value) {
      await activeModal.value.dismiss()
      activeModal.value.removeEventListener(
        'did-present',
        () => isPresent.value = false,
      )
      activeModal.value.removeEventListener(
        'will-dismiss',
        () => isPresent.value = false,
      )
      activeModal.value = null
    }
    else {
      // This should not happen, but in the cases where the modal was not created by us, we can try to close it
      const modal = await modalController.getTop()
      if (modal)
        await modal.dismiss()
    }
  }

  return {
    closeModal,
    isPresent,
    showModal,
    showNotificationAlert,
  }
}

export const useModal = createSharedComposable(_useModal)
