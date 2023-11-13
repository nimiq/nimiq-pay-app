<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonItem, IonList, IonToolbar, isPlatform } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { inject, ref } from 'vue'
import { onLongPress } from '@vueuse/core'
import { ModalType, useModal } from '@/composables/useModal'
import { BonusWallet } from '@/lib/bonus-wallet'
import ItemDivider from '@/components/ItemDivider.vue'

const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const isPhoneRegistered = bonusWallet.isRegistered()
const htmlRefHook = ref<HTMLElement | null>(null)
const { showModal, closeModal } = useModal()

function onLongPressCallback() {
  useModal().showModal(ModalType.Dev, { isOnTop: true })
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
    <IonItem button :detail="false" @click="showModal(ModalType.TopUp, { isSmall: true })">
      Top Up
    </IonItem>
    <IonItem button :detail="false" @click="showModal(ModalType.Withdraw)">
      Withdraw
    </IonItem>

    <!-- TODO: remove if when BlueCode is added -->
    <ItemDivider v-if="!isPhoneRegistered" />

    <!--
    <IonItem button :detail="false">
      Activate Bluecode payments
    </IonItem>
    -->
    <IonItem v-if="!isPhoneRegistered" button :detail="false" @click="showModal(ModalType.NewPhone)">
      Activate Cashback & Rewards
    </IonItem>

    <ItemDivider />

    <IonItem ref="htmlRefHook" button :detail="false" @click="showModal(ModalType.Settings, { isOnTop: true })">
      Settings
    </IonItem>
    <IonItem button :detail="false" @click="showModal(ModalType.Backup)">
      Back up account
    </IonItem>
    <IonItem button :detail="false" @click="showModal(ModalType.LogoutConfirm, { isSmall: true })">
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
