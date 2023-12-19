import { defineAsyncComponent, ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { modalController } from '@ionic/vue'
import type { ComponentProps, ComponentRef } from '@ionic/core'

export enum Modal {
  Backup = '@/modals/BackupModal/index.vue',
  Dev = '@/modals/DevModal.vue',
  ExpiringPoints = '@/modals/ExpiringPointsModal.vue',
  LogoutConfirm = '@/modals/LogOutModal/Confirm.vue',
  LogoutWarning = '@/modals/LogOutModal/Warning.vue',
  Menu = '@/modals/MenuModal.vue',
  Points = '@/modals/PointsModal.vue',
  Settings = '@/modals/SettingsModal.vue',
  Task = '@/modals/TaskModal.vue',
  Referral = '@/modals/ReferralModal.vue',
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
      case Modal.ExpiringPoints:
        component = defineAsyncComponent(() => import(Modal.ExpiringPoints))
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
      case Modal.Points:
        component = defineAsyncComponent(() => import(Modal.Points))
        break
      case Modal.Settings:
        component = defineAsyncComponent(() => import(Modal.Settings))
        break
      case Modal.Task:
        component = defineAsyncComponent(() => import(Modal.Task))
        break
      case Modal.Referral:
        component = defineAsyncComponent(() => import(Modal.Referral))
        break
      case Modal.Dev:
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

    allModals.unshift(modalToShow)
    await modalToShow.present()
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
  }
}

export const useModal = createSharedComposable(_useModal)
