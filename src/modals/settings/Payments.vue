<script setup lang="ts">
import { IonBackButton, IonButtons, IonItem, IonLabel, IonList, IonNote, IonSelect, IonSelectOption, IonSpinner } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { toCoins } from '@/composables/usePrice'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { Crypto, useApp } from '@/stores/app'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSync } from '@/stores/sync'

const logger = useLogger('SettingsPayments')
const { showModal, closeModal } = useModal()
const { htlcThreshold, withdrawalDenomination, withdrawalAddressesHistory, selectedFiat } = storeToRefs(useApp())
const { setToast } = useToast()

// Threshold is stored in luna; show it in NIM. Edited via the AutoDepositThreshold modal.
const htlcThresholdNim = computed(() => toCoins(htlcThreshold.value, Crypto.NIM))

// Same scan as the Dev modal's "Scan wallet history": finds HTLCs missing from the local DB, then reconciles them.
const isScanning = ref(false)
async function rescanPendingNim() {
  if (isScanning.value)
    return
  isScanning.value = true
  try {
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()
    await useSync().verifyRemoteSignersDb({ discoveryResult: result })
    if (result.errors.length || !result.localComplete)
      setToast({ message: i18n.t('Scan incomplete. Try again later.'), type: 'warning' })
    else if (result.added)
      setToast({ message: i18n.t('Found {count} missing deposits', { count: result.added }) })
    else
      setToast({ message: i18n.t('No missing deposits found') })
  }
  catch (error) {
    logger.error('Pending NIM rescan failed', error)
    setToast({ message: i18n.t('Scan incomplete. Try again later.'), type: 'error' })
  }
  finally {
    isScanning.value = false
  }
}
</script>

<template>
  <ModalTemplate :close-all="true">
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="closeModal()" />
      </IonButtons>
    </template>
    <div class="w-full h-full flex flex-col">
      <p class="text-space/60 text-sm font-bold text-left uppercase">
        {{ $t('Payments') }}
      </p>
      <IonList lines="none">
        <IonItem button :detail="false" @click="showModal(Modal.AutoDepositThreshold, { isOnTop: true, isSmall: true })">
          <IonLabel>{{ $t('Auto-deposit threshold') }}</IonLabel>
          <IonNote slot="end" class="text-lg">
            {{ htlcThresholdNim }} NIM
          </IonNote>
        </IonItem>

        <IonItem>
          <IonSelect
            :label="$t('Default withdrawal unit')" :value="withdrawalDenomination"
            @ion-change="withdrawalDenomination = $event.detail.value"
          >
            <IonSelectOption value="fiat">
              {{ selectedFiat }}
            </IonSelectOption>
            <IonSelectOption value="crypto">
              NIM / USDT
            </IonSelectOption>
          </IonSelect>
        </IonItem>

        <IonItem button :detail="false" @click="showModal(Modal.SettingsSavedAddresses, { isOnTop: true })">
          <IonLabel>{{ $t('Saved addresses') }}</IonLabel>
          <IonNote slot="end" class="text-lg">
            {{ withdrawalAddressesHistory.length }}
          </IonNote>
        </IonItem>

        <IonItem button :detail="false" :disabled="isScanning" @click="rescanPendingNim">
          <IonLabel>{{ $t('Rescan pending NIM') }}</IonLabel>
          <IonSpinner v-if="isScanning" slot="end" name="crescent" />
        </IonItem>
      </IonList>
    </div>
  </ModalTemplate>
</template>

<style scoped>
ion-item {
  @apply text-lg font-semibold;
  --padding-start: 0;
  --padding-end: 0;
}
</style>
