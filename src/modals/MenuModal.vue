<script setup lang="ts">
import { Browser } from '@capacitor/browser'
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { onLongPress } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import AppsIcon from '@/components/icons/apps.vue'
import BackupIcon from '@/components/icons/backup.vue'
import CreditCardIcon from '@/components/icons/credit-card.vue'
import GiftIcon from '@/components/icons/gift.vue'
import LiveChatIcon from '@/components/icons/live-chat.vue'
import LogoutIcon from '@/components/icons/log-out.vue'
import NimiqOutlineLogo from '@/components/icons/nimiq-outline.vue'
import SettingsIcon from '@/components/icons/settings.vue'
import MenuItem from '@/components/MenuItem.vue'
import { Modal, useModal } from '@/composables/useModal'
import { isMiniAppsEnabled, isNakaEnabled } from '@/lib'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useFeatureFlags } from '@/stores/feature-flags'
import { useLiveChat } from '@/stores/livechat'
import { useNaka } from '@/stores/naka'
import { usePoints } from '@/stores/points'

const htmlRefHook = ref<HTMLElement | null>(null)
const { showModal, closeModal } = useModal()
const { phoneNumberVerified } = storeToRefs(useApp())
const { isCampaignActive } = storeToRefs(usePoints())
const { enabled: liveChatEnabled, shown: liveChatShown } = storeToRefs(useLiveChat())

function onLongPressCallback() {
  useModal().showModal(Modal.Dev, { isOnTop: true })
}

const { hasCard, registration } = storeToRefs(useNaka())
const { isNakaAvailable } = storeToRefs(useFeatureFlags())
const showNakaSupport = computed(() => isNakaEnabled && !!registration.value?.nakaIdentification)
const showNakaMenuItem = computed(() => isNakaEnabled && hasCard.value)
const showActivateNakaMenuItem = computed(() => isNakaEnabled && !hasCard.value && isNakaAvailable.value)
const showPaymentsSection = computed(() => showNakaMenuItem.value || showActivateNakaMenuItem.value || showNakaSupport.value || (!phoneNumberVerified.value && isCampaignActive.value))

function openLiveChat() {
  liveChatEnabled.value = true
  liveChatShown.value = true
  useModal().closeModal()
}

onLongPress(
  htmlRefHook,
  onLongPressCallback,
  { modifiers: { prevent: true }, delay: 3 * 1e3 },
)
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="closeModal()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>

  <div class="flex flex-col gap-y-6 px-4 pt-4 pb-8">
    <span v-if="showPaymentsSection" class="uppercase text-space/60 font-bold text-sm">
      {{ $t('Payments') }}
    </span>

    <MenuItem
      v-if="showNakaMenuItem"
      :icon="CreditCardIcon"
      :title="$t('NAKA Card')"
      @click="initializeFlow(FlowName.NakaCardManagement)"
    />
    <MenuItem
      v-else-if="showActivateNakaMenuItem"
      :icon="CreditCardIcon"
      :title="$t('Activate NAKA Card')"
      @click="initializeFlow(FlowName.NakaOnboarding)"
    />
    <!-- Show Support only if KYC has been started -->
    <MenuItem
      v-if="showNakaSupport"
      :icon="LiveChatIcon"
      :title="$t('NAKA Support')"
      @click="openLiveChat"
    />

    <MenuItem
      v-if="!phoneNumberVerified && isCampaignActive"
      :icon="GiftIcon"
      :title="$t('Activate Cashback & Rewards')"
      @click="initializeFlow(FlowName.VerifyPhone)"
    />

    <span
      v-if="isMiniAppsEnabled"
      class="uppercase text-space/60 font-bold text-sm mt-6"
    >
      {{ $t('Features') }}
    </span>

    <MenuItem
      v-if="isMiniAppsEnabled"
      :icon="AppsIcon"
      :title="$t('Mini Apps')"
      @click="showModal(Modal.MiniApps)"
    />

    <span class="uppercase text-space/60 font-bold text-sm mt-6">
      {{ $t('App Settings') }}
    </span>

    <MenuItem
      ref="htmlRefHook"
      :icon="SettingsIcon"
      :title="$t('Settings')"
      aria-label="Settings"
      @click="showModal(Modal.Settings, { isOnTop: true })"
    />
    <MenuItem
      :icon="BackupIcon"
      :title="$t('Backup Account')"
      aria-label="Backup Account"
      @click="initializeFlow(FlowName.Backup)"
    />
    <MenuItem
      :icon="NimiqOutlineLogo"
      :title="$t('About')"
      aria-label="About"
      external
      @click="Browser.open({ url: 'https://www.nimiq.com/nimiq-pay/', toolbarColor: '#F4F4F4' })"
    />
    <MenuItem
      :icon="LogoutIcon"
      :title="$t('Log Out')"
      aria-label="Log Out"
      @click="showModal(Modal.LogoutConfirm, { isSmall: true })"
    />
  </div>
</template>
