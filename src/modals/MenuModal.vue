<script setup lang="ts">
import { Browser } from '@capacitor/browser'
import { IonButton, IonButtons, IonHeader, IonIcon, IonItem, IonList, IonToolbar, isPlatform } from '@ionic/vue'
import { onLongPress } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import ItemDivider from '@/components/ItemDivider.vue'
import { Modal, useModal } from '@/composables/useModal'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { usePoints } from '@/stores/points'
import { useNaka } from '../stores/naka'

const htmlRefHook = ref<HTMLElement | null>(null)
const { showModal, closeModal } = useModal()
const { phoneNumberVerified } = storeToRefs(useApp())
const { isCampaignActive } = storeToRefs(usePoints())

function onLongPressCallback() {
  useModal().showModal(Modal.Dev, { isOnTop: true })
}

const isNakaEnabled = __ENABLE_NAKA__
const { hasCard } = storeToRefs(useNaka())

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

  <IonList lines="none" class="px-2 pb-4" :class="isPlatform('ios') && 'pb-8'">
    <IonItem button :detail="false" @click="initializeFlow(FlowName.NimTopUp)">
      {{ $t('Top Up') }}
    </IonItem>
    <IonItem button :detail="false" @click="initializeFlow(FlowName.NimWithdraw)">
      {{ $t('Withdraw') }}
    </IonItem>

    <!-- TODO: remove if when BlueCode is added -->
    <ItemDivider v-if="!phoneNumberVerified && isCampaignActive" />

    <!--
    <IonItem button :detail="false">{{ $t('Activate Bluecode payments') }}</IonItem>
    -->
    <IonItem v-if="!phoneNumberVerified && isCampaignActive" button :detail="false" @click="initializeFlow(FlowName.VerifyPhone)">
      {{ $t('Activate Cashback & Rewards') }}
    </IonItem>

    <IonItem v-if="hasCard && isNakaEnabled" button :detail="false" @click="initializeFlow(FlowName.NakaCardManagement)">
      {{ $t('NAKA Card') }}
    </IonItem>

    <ItemDivider />

    <IonItem ref="htmlRefHook" button :detail="false" @click="showModal(Modal.Settings, { isOnTop: true })">
      {{ $t('Settings') }}
    </IonItem>
    <IonItem button :detail="false" @click="initializeFlow(FlowName.Backup)">
      {{ $t('Backup Account') }}
    </IonItem>
    <IonItem button :detail="false" @click="Browser.open({ url: 'https://www.nimiq.com/nimiq-pay/', toolbarColor: '#F4F4F4' })">
      {{ $t('About') }}
    </IonItem>
    <IonItem button :detail="false" @click="showModal(Modal.LogoutConfirm, { isSmall: true })">
      {{ $t('Log Out') }}
    </IonItem>
  </IonList>
</template>

<style scoped>
ion-item {
  @apply text-lg font-semibold;
  --padding-bottom: 8px;
}
</style>
