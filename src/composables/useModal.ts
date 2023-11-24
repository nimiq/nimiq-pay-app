import { defineAsyncComponent, ref } from 'vue'
import { StatusBar } from '@capacitor/status-bar'
import { createSharedComposable } from '@vueuse/core'
import { createAnimation, modalController, toastController } from '@ionic/vue'
import type { ComponentProps, ComponentRef } from '@ionic/core'
import { useDevice } from './useDevice'
import { check, xmark } from '@/components/icons'

export enum Modal {
  Backup = '@/modals/BackupModal/index.vue',
  CashlinkScanner = '@/modals/deposit/CashlinkScannerModal.vue',
  Dev = '@/modals/DevModal.vue',
  DetailedTransaction = '@/modals/DetailedTransactionModal.vue',
  EnablePushNotifications = '@/modals/setup/PushNotificationEnableModal.vue',
  ExpiringPoints = '@/modals/ExpiringPointsModal.vue',
  Login = '@/modals/setup/LoginModal.vue',
  LogoutConfirm = '@/modals/LogOutModal/Confirm.vue',
  LogoutWarning = '@/modals/LogOutModal/Warning.vue',
  Menu = '@/modals/MenuModal.vue',
  NewPin = '@/modals/setup/PinChooseModal.vue',
  NewPhone = '@/modals/setup/PhoneNumberModal/index.vue',
  NimTransfer = '@/modals/deposit/NimTransferModal.vue',
  Pay = '@/modals/PayModal/index.vue',
  PromoCode = '@/modals/setup/PromoCodeModal.vue',
  Points = '@/modals/PointsModal.vue',
  PointsIntro = '@/modals/setup/PointsIntroModal/index.vue',
  Settings = '@/modals/SettingsModal.vue',
  Task = '@/modals/TaskModal.vue',
  TopUp = '@/modals/TopUpModal.vue',
  TransactionHistory = '@/modals/TransactionHistoryModal.vue',
  Referral = '@/modals/ReferralModal.vue',
  Withdraw = '@/modals/WithdrawModal.vue',
}

function _useModal() {
  const isPresent = ref(false)
  const allModals: HTMLIonModalElement[] = []

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
      case Modal.Backup:
        component = defineAsyncComponent(() => import(Modal.Backup))
        break
      case Modal.CashlinkScanner:
        component = defineAsyncComponent(() => import(Modal.CashlinkScanner))
        break
      case Modal.DetailedTransaction:
        component = defineAsyncComponent(() => import(Modal.DetailedTransaction))
        break
      case Modal.EnablePushNotifications:
        component = defineAsyncComponent(() => import(Modal.EnablePushNotifications))
        break
      case Modal.ExpiringPoints:
        component = defineAsyncComponent(() => import(Modal.ExpiringPoints))
        break
      case Modal.Login:
        component = defineAsyncComponent(() => import(Modal.Login))
        break
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
      case Modal.Points:
        component = defineAsyncComponent(() => import(Modal.Points))
        break
      case Modal.PointsIntro:
        component = defineAsyncComponent(() => import(Modal.PointsIntro))
        break
      case Modal.Settings:
        component = defineAsyncComponent(() => import(Modal.Settings))
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
      case Modal.Referral:
        component = defineAsyncComponent(() => import(Modal.Referral))
        break
      case Modal.Withdraw:
        component = defineAsyncComponent(() => import(Modal.Withdraw))
        break
      case Modal.Dev:
        // if (import.meta.env.MODE === 'development')
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
    if (isFullscreen && useDevice().isAndroid)
      await StatusBar.setBackgroundColor({ color: '#ffffff' })

    allModals.unshift(modalToShow)
    await modalToShow.present()
  }

  async function showNotificationAlert(message: string, error = false) {
    // FIXME: animation not working
    // const enterAnimation = (baseEl: HTMLElement) => {
    //   const root = baseEl.shadowRoot
    //   const slideAnimation = createAnimation().addElement(root!.querySelector('.notification-alert-toast')!).fromTo('transform', 'translateY(-100%)', 'translateY(0)')

    //   return createAnimation()
    //     .addElement(baseEl)
    //     .duration(500)
    //     .addAnimation(slideAnimation)
    // }

    const toast = await toastController.create({
      message,
      duration: 3 * 1e3,
      icon: error ? xmark : check,
      cssClass: `notification-alert-toast ${error && 'toast-error'}`,
      position: 'top',
      // animated: true,
      // enterAnimation,
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

    if (useDevice().isAndroid)
      await StatusBar.setBackgroundColor({ color: '#F8F8F8' })
  }

  async function closeAllModals() {
    const modal = await modalController.getTop()

    // Close all modals in background
    allModals.forEach(async (modal) => {
      if (modal)
        await modal.dismiss()
    })
    if (modal)
      await modal.dismiss()
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
