import { defineAsyncComponent, ref } from 'vue'
import { StatusBar } from '@capacitor/status-bar'
import { createSharedComposable } from '@vueuse/core'
import { isPlatform, modalController, toastController } from '@ionic/vue'
import type { ComponentProps, ComponentRef } from '@ionic/core'
import { check, xmark } from '@/components/icons'

export enum ModalType {
  Backup = '@/modals/BackupModal/index.vue',
  CashlinkScanner = '@/modals/deposit/CashlinkScannerModal.vue',
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
  Settings = '@/modals/SettingsModal.vue',
  Task = '@/modals/TaskModal.vue',
  TopUp = '@/modals/TopUpModal.vue',
  TransactionHistory = '@/modals/TransactionHistoryModal.vue',
  Referral = '@/modals/ReferralModal.vue',
  Withdraw = '@/modals/WithdrawModal.vue',
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
      case ModalType.CashlinkScanner:
        component = defineAsyncComponent(() => import(ModalType.CashlinkScanner))
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
      case ModalType.Settings:
        component = defineAsyncComponent(() => import(ModalType.Settings))
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
      case ModalType.Referral:
        component = defineAsyncComponent(() => import(ModalType.Referral))
        break
      case ModalType.Withdraw:
        component = defineAsyncComponent(() => import(ModalType.Withdraw))
        break
      case ModalType.Dev:
        // if (import.meta.env.MODE === 'development')
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
    if (isFullscreen && isPlatform('android') && !isPlatform('mobileweb'))
      await StatusBar.setBackgroundColor({ color: '#ffffff' })

    await modalToShow.present()
  }

  async function showNotificationAlert(message: string, error = false) {
    const toast = await toastController.create({
      message,
      duration: 3 * 1e3,
      icon: error ? xmark : check,
      cssClass: `notification-alert-toast ${error && 'toast-error'}`,
      position: 'top',
    })
    await toast.present()
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

    if (isPlatform('android') && !isPlatform('mobileweb'))
      await StatusBar.setBackgroundColor({ color: '#F8F8F8' })
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
