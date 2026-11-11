<script setup lang="ts">
import { IonBackButton, IonButtons } from '@ionic/vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import WithdrawalAddressList from '@/components/WithdrawalAddressList.vue'
import { useModal } from '@/composables/useModal'

const { closeModal } = useModal()
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
        {{ $t('Saved addresses') }}
      </p>
      <WithdrawalAddressList manage />
    </div>
  </ModalTemplate>
</template>
