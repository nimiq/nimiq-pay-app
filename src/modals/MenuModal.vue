<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal, IonToolbar, isPlatform } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { inject, ref } from 'vue'
import ItemDivider from '@/components/ItemDivider.vue'
import { ModalType, useModal } from '@/composables/useModal'
import { BonusWallet } from '@/lib/bonus-wallet'

const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const isPhoneRegistered = bonusWallet.isRegistered()
const { showModal } = useModal()
const menuModal = ref()
</script>

<template>
  <IonModal
    ref="menuModal" trigger="main-menu-button" :initial-breakpoint="1"
    :breakpoints="[0, 1]" handle="false" style="--height: auto"
  >
    <IonHeader class="ion-no-border">
      <IonToolbar>
        <IonButtons slot="end">
          <IonButton @click.stop="menuModal.$el.dismiss()">
            <IonIcon :icon="close" />
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>

    <IonList lines="none" class="px-2 pb-4" :class="isPlatform('ios') && 'pb-8'">
      <IonItem button :detail="false">
        Top Up
      </IonItem>
      <IonItem button :detail="false">
        Withdraw
      </IonItem>

      <ItemDivider />

      <IonItem button :detail="false">
        Activate Bluecode payments
      </IonItem>
      <IonItem v-if="!isPhoneRegistered" button :detail="false" @click="showModal(ModalType.NewPhone)">
        Activate Cashback & Rewards
      </IonItem>

      <ItemDivider />

      <IonItem button :detail="false">
        Settings
      </IonItem>
      <IonItem button :detail="false">
        Back Up
      </IonItem>
      <IonItem button :detail="false">
        Log Out
      </IonItem>
    </IonList>
  </IonModal>
</template>

<style scoped>
ion-item {
  @apply text-xl font-semibold text-blue-500;
  --padding-top: 0.25rem;
  --padding-bottom: 0.25rem;
}
</style>
