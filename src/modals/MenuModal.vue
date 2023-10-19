<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal, IonToolbar, isPlatform } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { inject, ref } from 'vue'
import ItemDivider from '@/components/ItemDivider.vue'
import { ModalType, useModal } from '@/composables/useModal'
import { BonusWallet } from '@/lib/bonus-wallet'

const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const isPhoneRegistered = bonusWallet.isRegistered()
const { showModal, closeModal } = useModal()
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="closeModal()">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>

  <IonList lines="none" class="px-2 pb-4" :class="isPlatform('ios') && 'pb-8'">
    <IonItem button :detail="false" @click="showModal(ModalType.TopUp, { isSmall: true })">
      Top Up
    </IonItem>
    <IonItem button :detail="false">
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

    <IonItem button :detail="false">
      Settings
    </IonItem>
    <IonItem button :detail="false" @click="showModal(ModalType.Backup)">
      Back Up
    </IonItem>
    <IonItem button :detail="false" @click="showModal(ModalType.LogoutConfirm, { isSmall: true })">
      Log Out
    </IonItem>
  </IonList>
</template>

<style scoped>
ion-item {
  @apply text-xl font-semibold text-blue-500;
  --padding-top: 0.25rem;
  --padding-bottom: 0.25rem;
}
</style>
