import { defineAsyncComponent, ref } from 'vue'
import type { Ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { modalController } from '@ionic/vue'
import type { ComponentProps, ComponentRef } from '@ionic/core'

export enum ModalType {
  Backup = '@/modals/BackupModal/index.vue',
  Dev = '@/modals/DevModal.vue',
  DetailedTransaction = '@/modals/DetailedTransactionModal.vue',
  EnablePushNotifications = '@/modals/setup/PushNotificationEnableModal.vue',
  ExpiringRewards = '@/modals/ExpiringRewardsModal.vue',
  Login = '@/modals/setup/LoginModal.vue',
  LogoutConfirm = '@/modals/LogOutModal/Confirm.vue',
  LogoutWarning = '@/modals/LogOutModal/Warning.vue',
  Menu = '@/modals/MenuModal.vue',
  NewPin = '@/modals/setup/PinChooseModal.vue',
  NewPhone = '@/modals/setup/PhoneNumberModal/index.vue',
  NimTransfer = '@/modals/deposit/NimTransferModal.vue',
  Pay = '@/modals/PayModal/index.vue',
  PromoCode = '@/modals/setup/PromoCodeModal.vue',
  Rewards = '@/modals/RewardsModal.vue',
  RewardsIntro = '@/modals/setup/RewardsIntroModal/index.vue',
  Task = '@/modals/TaskModal.vue',
  TopUp = '@/modals/TopUpModal.vue',
  TransactionHistory = '@/modals/TransactionHistoryModal.vue',
  Voucher = '@/modals/VoucherModal.vue',
}

function _useModal() {
  const isPresent = ref(false)

  async function showModal(modal: ModalType, options?: { isOnTop?: boolean; isFullscreen?: boolean; isSmall?: boolean; componentProps?: ComponentProps<ComponentRef> }) {
    const { isOnTop, isFullscreen, isSmall, componentProps } = options || {}
    if (import.meta.env.MODE === 'development') {
      // eslint-disable-next-line no-console
      console.log('showModal', modal)
    }

    let component: ComponentRef = null
    if (!isOnTop)
      await closeModal()

    // Lazy loading of modals, we need to do this because dynamic import is not supported by Vite
    switch (modal) {
      case ModalType.Backup:
        component = defineAsyncComponent(() => import(ModalType.Backup))
        break
      case ModalType.DetailedTransaction:
        component = defineAsyncComponent(() => import(ModalType.DetailedTransaction))
        break
      case ModalType.EnablePushNotifications:
        component = defineAsyncComponent(() => import(ModalType.EnablePushNotifications))
        break
      case ModalType.ExpiringRewards:
        component = defineAsyncComponent(() => import(ModalType.ExpiringRewards))
        break
      case ModalType.Login:
        component = defineAsyncComponent(() => import(ModalType.Login))
        break
      case ModalType.LogoutConfirm:
        component = defineAsyncComponent(() => import(ModalType.LogoutConfirm))
        break
      case ModalType.LogoutWarning:
        component = defineAsyncComponent(() => import(ModalType.LogoutWarning))
        break
      case ModalType.Menu:
        component = defineAsyncComponent(() => import(ModalType.Menu))
        break
      case ModalType.NewPin:
        component = defineAsyncComponent(() => import(ModalType.NewPin))
        break
      case ModalType.NewPhone:
        component = defineAsyncComponent(() => import(ModalType.NewPhone))
        break
      case ModalType.NimTransfer:
        component = defineAsyncComponent(() => import(ModalType.NimTransfer))
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
      case ModalType.Task:
        component = defineAsyncComponent(() => import(ModalType.Task))
        break
      case ModalType.TopUp:
        component = defineAsyncComponent(() => import(ModalType.TopUp))
        break
      case ModalType.TransactionHistory:
        component = defineAsyncComponent(() => import(ModalType.TransactionHistory))
        break
      case ModalType.Voucher:
        component = defineAsyncComponent(() => import(ModalType.Voucher))
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
      componentProps,
    })
    if (isSmall)
      modalToShow.style.setProperty('--height', 'auto')

    await modalToShow.present()
  }

  async function showNotificationAlert({ title, subtitle, message, extra }: { title: string; subtitle?: string; message?: string; extra?: string }) {
    return new Promise<void>((resolve) => {
      modalController.create({
        component: defineAsyncComponent(() => import('@/components/NotificationAlert.vue')),
        handle: false,
        canDismiss: async (data?: any, role?: string) => role !== 'backdrop',
        componentProps: { title, subtitle, message, extra },
      }).then(async (modal) => {
        if (import.meta.env.MODE === 'development') {
          // eslint-disable-next-line no-console
          console.log('showNotificationAlert')
        }
        // Adding styles to make it look like a notification
        modal.style.setProperty('--width', 'fit-content')
        modal.style.setProperty('--min-width', '250px')
        modal.style.setProperty('--max-width', '80vw')
        modal.style.setProperty('--height', 'fit-content')
        modal.style.setProperty('--border-radius', '18px')
        modal.style.setProperty('--border-color', 'rgb(59 130 246)')
        modal.style.setProperty('--border-width', '1.5px')
        modal.style.setProperty('--border-style', 'solid')

        await modal.present()
        setTimeout(async () => {
          await modal.dismiss()
          resolve()
        }, 2000)
      })
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

  async function closeAllModals() {
    let modal = await modalController.getTop()
    while (modal) {
      await modal.dismiss()
      modal = await modalController.getTop()
    }
  }

  return {
    closeModal,
    closeAllModals,
    isPresent,
    showModal,
    showNotificationAlert,
  }
}

export const useModal = createSharedComposable(_useModal)
