import { defineAsyncComponent, ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { modalController } from '@ionic/vue'
import type { ComponentProps, ComponentRef } from '@ionic/core'

export enum Modal {
  Login = '@/modals/Login.vue',
  Backup = '@/modals/BackupModal/index.vue',
  Dev = '@/modals/DevModal.vue',
  DetailedTransaction = '@/modals/DetailedTransactionModal.vue',
  EnablePushNotifications = '@/modals/setup/PushNotificationEnableModal.vue',
  ExpiringRewards = '@/modals/ExpiringRewardsModal.vue',
  // Login = '@/modals/setup/LoginModal.vue',
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

  async function showModal(modal: Modal, options?: { isOnTop?: boolean; isFullscreen?: boolean; isSmall?: boolean; componentProps?: ComponentProps<ComponentRef> }) {
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
      case Modal.Login:
        component = defineAsyncComponent(() => import(Modal.Login))
        break
      case Modal.Backup:
        component = defineAsyncComponent(() => import(Modal.Backup))
        break
      case Modal.DetailedTransaction:
        component = defineAsyncComponent(() => import(Modal.DetailedTransaction))
        break
      case Modal.EnablePushNotifications:
        component = defineAsyncComponent(() => import(Modal.EnablePushNotifications))
        break
      case Modal.ExpiringRewards:
        component = defineAsyncComponent(() => import(Modal.ExpiringRewards))
        break
      // case Modal.Login:
      //   component = defineAsyncComponent(() => import(Modal.Login))
      //   break
      case Modal.LogoutConfirm:
        component = defineAsyncComponent(() => import(Modal.LogoutConfirm))
        break
      case Modal.LogoutWarning:
        component = defineAsyncComponent(() => import(Modal.LogoutWarning))
        break
      case Modal.Menu:
        component = defineAsyncComponent(() => import(Modal.Menu))
        break
      case Modal.NewPin:
        component = defineAsyncComponent(() => import(Modal.NewPin))
        break
      case Modal.NewPhone:
        component = defineAsyncComponent(() => import(Modal.NewPhone))
        break
      case Modal.NimTransfer:
        component = defineAsyncComponent(() => import(Modal.NimTransfer))
        break
      case Modal.Pay:
        component = defineAsyncComponent(() => import(Modal.Pay))
        break
      case Modal.PromoCode:
        component = defineAsyncComponent(() => import(Modal.PromoCode))
        break
      case Modal.Rewards:
        component = defineAsyncComponent(() => import(Modal.Rewards))
        break
      case Modal.RewardsIntro:
        component = defineAsyncComponent(() => import(Modal.RewardsIntro))
        break
      case Modal.Task:
        component = defineAsyncComponent(() => import(Modal.Task))
        break
      case Modal.TopUp:
        component = defineAsyncComponent(() => import(Modal.TopUp))
        break
      case Modal.TransactionHistory:
        component = defineAsyncComponent(() => import(Modal.TransactionHistory))
        break
      case Modal.Voucher:
        component = defineAsyncComponent(() => import(Modal.Voucher))
        break
      case Modal.Dev:
        if (import.meta.env.MODE === 'development')
          component = defineAsyncComponent(() => import(Modal.Dev))
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

  async function showNotificationAlert({ title, message, extra }: { title: string; message?: string; extra?: string }) {
    return new Promise<void>((resolve) => {
      modalController.create({
        component: defineAsyncComponent(() => import('@/components/NotificationAlert.vue')),
        handle: false,
        canDismiss: async (data?: any, role?: string) => role !== 'backdrop',
        componentProps: { title, message, extra },
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
