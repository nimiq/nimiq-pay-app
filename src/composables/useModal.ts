import { defineAsyncComponent, ref } from 'vue'
import type { Ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { modalController } from '@ionic/vue'
import type { ComponentRef } from '@ionic/core'

export enum ModalType {
  Dev = '@/modals/DevModal.vue',
  EnablePushNotifications = '@/modals/setup/PushNotificationEnableModal.vue',
  ExpiringRewards = '@/modals/ExpiringRewardsModal.vue',
  Login = '@/modals/setup/LoginModal.vue',
  NewPin = '@/modals/setup/PinChooseModal.vue',
  NewPhone = '@/modals/setup/PhoneNumberModal/index.vue',
  Pay = '@/modals/PayModal/index.vue',
  PromoCode = '@/modals/setup/PromoCodeModal.vue',
  Rewards = '@/modals/RewardsModal.vue',
  RewardsIntro = '@/modals/setup/RewardsIntroModal/index.vue',
}

function _useModal() {
  const isPresent = ref(false)

  async function showModal(modal: ModalType, isOnTop = false, isFullscreen = false) {
    if (import.meta.env.MODE === 'development') {
      // eslint-disable-next-line no-console
      console.log('showModal', modal)
    }

    let component: ComponentRef = null
    if (!isOnTop)
      await closeModal()

    // Lazy loading of modals, we need to do this because dynamic import is not supported by Vite
    switch (modal) {
      case ModalType.EnablePushNotifications:
        component = defineAsyncComponent(() => import(ModalType.EnablePushNotifications))
        break
      case ModalType.ExpiringRewards:
        component = defineAsyncComponent(() => import(ModalType.ExpiringRewards))
        break
      case ModalType.NewPin:
        component = defineAsyncComponent(() => import(ModalType.NewPin))
        break
      case ModalType.NewPhone:
        component = defineAsyncComponent(() => import(ModalType.NewPhone))
        break
      case ModalType.Pay:
        component = defineAsyncComponent(() => import(ModalType.Pay))
        break
      case ModalType.PromoCode:
        component = defineAsyncComponent(() => import(ModalType.PromoCode))
        break
      case ModalType.Rewards:
        component = defineAsyncComponent(() => import(ModalType.Rewards))
        break
      case ModalType.RewardsIntro:
        component = defineAsyncComponent(() => import(ModalType.RewardsIntro))
        break
      case ModalType.Dev:
        if (import.meta.env.MODE === 'development')
          component = defineAsyncComponent(() => import(ModalType.Dev))
        break
    }

    const modalToShow = await modalController.create({
      component,
      handle: false,
      canDismiss: true,
      initialBreakpoint: isFullscreen ? undefined : 1,
      breakpoints: isFullscreen ? undefined : [0, 1],
    })
    await modalToShow.present()
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
      setTimeout(async () => {
        await modal.dismiss()
        resolve()
      }, 2000)
    })
  }

  async function closeModal(modalToClose?: HTMLIonModalElement) {
    // Close the top modal
    const modal = modalToClose || await modalController.getTop()

    if (import.meta.env.MODE === 'development') {
      // eslint-disable-next-line no-console
      console.log('closeModal', modal)
    }
    if (modal)
      await modal.dismiss()
  }

  return {
    closeModal,
    isPresent,
    showModal,
    showNotificationAlert,
  }
}

export const useModal = createSharedComposable(_useModal)
