import type { ComponentProps, ComponentRef } from '@ionic/core'
import type { FeatureName } from '@/lib/analytics'
import { modalController } from '@ionic/vue'
import { createSharedComposable } from '@vueuse/core'
import { defineAsyncComponent } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { trackFeatureOpened } from '@/lib/analytics'

const logger = useLogger('useModal')

export type CloseRole = 'confirm' | 'cancel'

export enum Modal {
  DeletePoints = '@/modals/DeletePointsModal.vue',
  Disclaimer = '@/modals/DisclaimerModal.vue',
  Dev = '@/modals/DevModal.vue',
  EnableBiometric = '@/modals/EnableBiometricModal.vue',
  ExpiringPoints = '@/modals/ExpiringPointsModal.vue',
  LogoutConfirm = '@/modals/LogOutModal/Confirm.vue',
  LogoutWarning = '@/modals/LogOutModal/Warning.vue',
  LongTimeNoSee = '@/modals/LongTimeNoSeeModal.vue',
  Menu = '@/modals/MenuModal.vue',
  Points = '@/modals/PointsModal.vue',
  MiniApps = '@/modals/MiniAppsModal.vue',
  MiniAppWarning = '@/modals/MiniAppWarningModal.vue',
  Settings = '@/modals/SettingsModal.vue',
  Task = '@/modals/TaskModal.vue',
  Referral = '@/modals/ReferralModal.vue',
  SecretFeatures = '@/modals/SecretFeaturesModal.vue',
  Map = '@/modals/MapModal.vue',
}

interface ModalAnalyticsOptions {
  featureName: FeatureName
  source: string
}

function _useModal() {
  const allModals: HTMLIonModalElement[] = []

  async function showModal(modal: Modal, options?: { isOnTop?: boolean, isFullscreen?: boolean, isSmall?: boolean, showHandle?: boolean, componentProps?: ComponentProps<ComponentRef>, canDismiss?: boolean, analytics?: ModalAnalyticsOptions }): Promise<HTMLIonModalElement | undefined> {
    const { isOnTop, isFullscreen, isSmall, showHandle, componentProps, canDismiss = true, analytics } = options || {}
    if (import.meta.env.MODE === 'development')
      logger.log('showModal', modal)

    let component: ComponentRef = null
    if (!isOnTop)
      await closeModal()

    // Lazy loading of modals, we need to do this because dynamic import is not supported by Vite
    switch (modal) {
      case Modal.DeletePoints:
        component = defineAsyncComponent(() => import(Modal.DeletePoints))
        break
      case Modal.Disclaimer:
        component = defineAsyncComponent(() => import(Modal.Disclaimer))
        break
      case Modal.EnableBiometric:
        component = defineAsyncComponent(() => import(Modal.EnableBiometric))
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
      case Modal.LongTimeNoSee:
        component = defineAsyncComponent(() => import(Modal.LongTimeNoSee))
        break
      case Modal.Menu:
        component = defineAsyncComponent(() => import(Modal.Menu))
        break
      case Modal.Points:
        component = defineAsyncComponent(() => import(Modal.Points))
        break
      case Modal.MiniApps:
        component = defineAsyncComponent(() => import(Modal.MiniApps))
        break
      case Modal.MiniAppWarning:
        component = defineAsyncComponent(() => import(Modal.MiniAppWarning))
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
      case Modal.SecretFeatures:
        component = defineAsyncComponent(() => import(Modal.SecretFeatures))
        break
      case Modal.Map:
        component = defineAsyncComponent(() => import(Modal.Map))
        break
    }

    const modalToShow = await modalController.create({
      component,
      handle: showHandle ?? false,
      handleBehavior: showHandle ? 'cycle' : undefined,
      canDismiss,
      initialBreakpoint: isFullscreen ? undefined : 1,
      breakpoints: isFullscreen ? undefined : [0, 1],
      componentProps,
    })
    if (isSmall)
      modalToShow.style.setProperty('--height', 'auto')
    if (isFullscreen)
      modalToShow.style.setProperty('--border-radius', '0')

    allModals.unshift(modalToShow)
    await modalToShow.present()

    if (analytics) {
      const { useApp } = await import('@/stores/app')
      trackFeatureOpened({
        featureName: analytics.featureName,
        source: analytics.source,
        channel: 'modal',
        activeAsset: useApp().activeAsset,
      })
    }

    return modalToShow
  }

  async function closeModal({ modal: modalToClose, data = null, role = 'confirm' }: { modal?: HTMLIonModalElement, data?: any, role?: CloseRole } = {}) {
    // Close the top modal
    const modal = modalToClose || await modalController.getTop()

    if (import.meta.env.MODE === 'development')
      logger.log('closeModal', modal)

    if (modal) {
      modal.canDismiss = true
      await modal.dismiss(data, role)
    }
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
    showModal,
  }
}

export const useModal = createSharedComposable(_useModal)
