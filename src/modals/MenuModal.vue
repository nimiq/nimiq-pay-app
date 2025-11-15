<script setup lang="ts">
import { Browser } from '@capacitor/browser'
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { onLongPress } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import BackupIcon from '@/components/icons/backup.vue'
import CreditCardIcon from '@/components/icons/credit-card.vue'
import GiftIcon from '@/components/icons/gift.vue'
import LiveChatIcon from '@/components/icons/live-chat.vue'
import LoadingSpinnerIcon from '@/components/icons/loading-spinner.vue'
import LogoutIcon from '@/components/icons/log-out.vue'
import NimiqOutlineLogo from '@/components/icons/nimiq-outline.vue'
import SettingsIcon from '@/components/icons/settings.vue'
import TopUpIcon from '@/components/icons/top-up.vue'
import WithdrawIcon from '@/components/icons/withdraw.vue'
import MenuItem from '@/components/MenuItem.vue'
import { Modal, useModal } from '@/composables/useModal'
import { isNakaEnabled } from '@/lib'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useLocalWallet } from '@/stores/local-wallet'
import { useNaka } from '@/stores/naka'
import { usePoints } from '@/stores/points'

const htmlRefHook = ref<HTMLElement | null>(null)
const { showModal, closeModal } = useModal()
const { phoneNumberVerified, liveChatEnabled } = storeToRefs(useApp())
const { isCampaignActive } = storeToRefs(usePoints())

function onLongPressCallback() {
  useModal().showModal(Modal.Dev, { isOnTop: true })
}

const { hasCard, registration, card } = storeToRefs(useNaka())

const liveChatLoading = ref(false)

async function openLiveChat() {
  liveChatEnabled.value = true

  // Wait for _chatlio to be available
  await new Promise((resolve) => {
    function check() {
      if (window._chatlio) {
        resolve(true)
      }
      else {
        liveChatLoading.value = true
        setTimeout(check, 50)
      }
    }
    check()
  })

  const openPromise = new Promise((resolve) => {
    const handler = function (_event: Event) {
      document.removeEventListener('chatlio.visibilityChange', handler)
      resolve(true)
    }
    document.addEventListener('chatlio.visibilityChange', handler)
  })

  window._chatlio.show({ expanded: true })
  await openPromise
  useModal().closeModal()
  liveChatLoading.value = false

  window._chatlio.identify(useLocalWallet().localAddress.toUserFriendlyAddress(), {
    'name': registration.value?.nakaIdentification?.firstName?.split(' ')[0],
    'KYC Status': registration.value?.nakaIdentification?.status || '-',
    'Card Masked PAN': card.value?.maskedPan || '-',
    'Card Status': card.value?.statusId || '-',
    'Card Lock': card.value?.lockLevel || 'no',
  })
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
    <MenuItem
      :icon="TopUpIcon"
      :title="$t('Top Up')"
      @click="initializeFlow(FlowName.NimTopUp)"
    />
    <MenuItem
      :icon="WithdrawIcon"
      :title="$t('Withdraw')"
      @click="initializeFlow(FlowName.NimWithdraw)"
    />

    <!-- TODO: Remove this when not needed anymore -->
    <span v-if="isNakaEnabled || (!phoneNumberVerified && isCampaignActive)" class="uppercase text-space/60 font-bold text-sm mt-6">
      {{ $t('Payments') }}
    </span>

    <MenuItem
      v-if="hasCard && isNakaEnabled"
      :icon="CreditCardIcon"
      :title="$t('NAKA Card')"
      @click="initializeFlow(FlowName.NakaCardManagement)"
    />
    <MenuItem
      v-else-if="isNakaEnabled"
      :icon="CreditCardIcon"
      :title="$t('Activate NAKA Card')"
      @click="initializeFlow(FlowName.NakaOnboarding)"
    />
    <MenuItem
      v-if="registration"
      :icon="liveChatLoading ? LoadingSpinnerIcon : LiveChatIcon"
      :title="$t('NAKA Support')"
      @click="openLiveChat()"
    />

    <MenuItem
      v-if="!phoneNumberVerified && isCampaignActive"
      :icon="GiftIcon"
      :title="$t('Activate Cashback & Rewards')"
      @click="initializeFlow(FlowName.VerifyPhone)"
    />

    <span class="uppercase text-space/60 font-bold text-sm mt-6">
      {{ $t('App Settings') }}
    </span>

    <MenuItem
      ref="htmlRefHook"
      :icon="SettingsIcon"
      :title="$t('Settings')"
      @click="showModal(Modal.Settings, { isOnTop: true })"
    />
    <MenuItem
      :icon="BackupIcon"
      :title="$t('Backup Account')"
      @click="initializeFlow(FlowName.Backup)"
    />
    <MenuItem
      :icon="NimiqOutlineLogo"
      :title="$t('About')"
      external
      @click="Browser.open({ url: 'https://www.nimiq.com/nimiq-pay/', toolbarColor: '#F4F4F4' })"
    />
    <MenuItem
      :icon="LogoutIcon"
      :title="$t('Log Out')"
      @click="showModal(Modal.LogoutConfirm, { isSmall: true })"
    />
  </div>
</template>
