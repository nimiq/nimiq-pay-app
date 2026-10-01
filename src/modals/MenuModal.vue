<script setup lang="ts">
import { Browser } from '@capacitor/browser'
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { onLongPress } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import AppsIcon from '@/components/icons/apps.vue'
import BackupIcon from '@/components/icons/backup.vue'
import GiftIcon from '@/components/icons/gift.vue'
import LiveChatIcon from '@/components/icons/live-chat.vue'
import LogoutIcon from '@/components/icons/log-out.vue'
import NimiqOutlineLogo from '@/components/icons/nimiq-outline.vue'
import SettingsIcon from '@/components/icons/settings.vue'
import SparklesIcon from '@/components/icons/sparkles.vue'
import MenuItem from '@/components/MenuItem.vue'
import { Modal, useModal } from '@/composables/useModal'
import { isMiniAppsEnabled } from '@/lib'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useLiveChat } from '@/stores/livechat'
import { usePoints } from '@/stores/points'

const htmlRefHook = ref<HTMLElement | null>(null)
const { showModal, closeModal } = useModal()
const { phoneNumberVerified } = storeToRefs(useApp())
const { isCampaignActive } = storeToRefs(usePoints())
const { enabled: liveChatEnabled, shown: liveChatShown } = storeToRefs(useLiveChat())

function onLongPressCallback() {
  useModal().showModal(Modal.Dev, { isOnTop: true })
}

const showPaymentsSection = computed(() => !phoneNumberVerified.value && isCampaignActive.value)

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
      :icon="LiveChatIcon"
      :title="$t('Support')"
      @click="openLiveChat"
    />

    <MenuItem
      v-if="!phoneNumberVerified && isCampaignActive"
      :icon="GiftIcon"
      :title="$t('Activate Cashback & Rewards')"
      @click="initializeFlow(FlowName.VerifyPhone, { analyticsSource: 'menu_rewards' })"
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
      @click="showModal(Modal.MiniApps, { analytics: { featureName: 'mini_apps', source: 'menu' } })"
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
      @click="initializeFlow(FlowName.Backup, { analyticsSource: 'menu' })"
    />
    <MenuItem
      :icon="SparklesIcon"
      :title="$t('What\'s New')"
      aria-label="What's New"
      @click="showModal(Modal.Changelog, { isOnTop: true })"
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
