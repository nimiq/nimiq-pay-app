<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonItem, IonList, IonToolbar, isPlatform } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { ref } from 'vue'
import { onLongPress } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { Modal, useModal } from '@/composables/useModal'
import ItemDivider from '@/components/ItemDivider.vue'
import { useApp } from '@/stores/app'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'

const htmlRefHook = ref<HTMLElement | null>(null)
const { showModal, closeModal } = useModal()
const { phoneNumberVerified } = storeToRefs(useApp())

function onLongPressCallback() {
  useModal().showModal(Modal.Dev, { isOnTop: true })
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

  <IonList lines="none" class="px-2 pb-4" :class="isPlatform('ios') && 'pb-8'">
    <IonItem button :detail="false" @click="showModal(Modal.TopUp, { isSmall: true })">
      Top Up
    </IonItem>
    <IonItem button :detail="false" @click="initializeFlow(FlowName.NimWithdraw)">
      Withdraw
    </IonItem>

    <!-- TODO: remove if when BlueCode is added -->
    <ItemDivider v-if="!phoneNumberVerified" />

    <!--
    <IonItem button :detail="false">
      Activate Bluecode payments
    </IonItem>
    -->
    <IonItem v-if="!phoneNumberVerified" button :detail="false" @click="showModal(Modal.NewPhone)">
      Activate Cashback & Rewards
    </IonItem>

    <ItemDivider />

    <IonItem ref="htmlRefHook" button :detail="false" @click="showModal(Modal.Settings, { isOnTop: true })">
      Settings
    </IonItem>
    <IonItem button :detail="false" @click="showModal(Modal.Backup)">
      Back up account
    </IonItem>
    <IonItem button :detail="false" @click="showModal(Modal.LogoutConfirm, { isSmall: true })">
      Log Out
    </IonItem>
  </IonList>
</template>

<style scoped>
ion-item {
  @apply text-lg font-semibold;
  --padding-bottom: 8px;
}
</style>
