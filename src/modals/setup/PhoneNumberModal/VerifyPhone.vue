<script setup lang="ts">
import { inject, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { IonBackButton, IonButton, IonButtons, IonContent, IonGrid, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { useRoute } from 'vue-router'
import NotificationAlert from '@/components/NotificationAlert.vue'
import { BonusWallet } from '@/lib/bonus-wallet'
import { ModalType, useModal } from '@/composables/useModal'

const { showModal, closeModal, showNotificationAlert } = useModal()
const { path } = useRoute()
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const codeField = ref()
const prefill = bonusWallet.getPrefillAccessCode()
const code: Ref<number | null> = ref(Number(prefill))
const bonusModal: Ref<{ $el: HTMLIonModalElement } | undefined> = ref()
const nav = (document.querySelector('[data-phone-nav]')) as Nav & HTMLElement

watch(code, (newValue) => {
  if (newValue?.toString().length === 8)
    handleVerify()
})

async function handleVerify() {
  try {
    if (!code.value)
      return

    await bonusWallet.verify(code.value)
    if (path === '/setup') {
      showModal(ModalType.EnablePushNotifications)
    }
    else if (path === '/app') {
      await showNotificationAlert(bonusModal)
      showModal(ModalType.RewardsIntro)
    }
  }
  catch (e: any) {
    codeField.value.setCustomValidity(e.message || e)
    codeField.value.reportValidity()
  }
}

// TODO
function handleResendRequest() {
  //   (async () => {
  //     try {
  //       await bonusWallet.authorize()
  //     }
  //     catch (e: any) {
  //       codeField.value.setCustomValidity(e.message || e)
  //       codeField.value.reportValidity()
  //     }
  //   })()
  nav.pop()
}

onMounted(() => {
  setTimeout(() => {
    codeField.value.focus()
  }, 200)
})
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="start">
        <IonBackButton />
      </IonButtons>
      <IonButtons slot="end">
        <IonButton @click="() => closeModal()">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent class="text-center ion-padding">
    <IonGrid class="mx-6">
      <h1 class="mb-4">
        Confirm your phone number
      </h1>
      <p class="mb-8 text-xl font-semibold">
        We've sent you a code, please confirm.
      </p>
      <form @submit.prevent>
        <input
          ref="codeField" v-model="code" type="number" inputmode="numeric" pattern="[0-9]*" minlength="8"
          maxlength="8" class="w-full p-1 my-2 pin" autofocus="true"
        >
      </form>
      <IonGrid class="flex items-center justify-between">
        <IonButton fill="clear" class="text-xl font-bold" @click="handleResendRequest">
          Resend Code
        </IonButton>
        <IonButton size="small" class="text-xl font-bold" :disabled="(code || '').toString().length !== 8" @click="handleVerify">
          Verify
        </IonButton>
      </IonGrid>
    </IonGrid>

    <NotificationAlert ref="bonusModal">
      <template #title>
        BonusNIM is now active!
      </template>
    </NotificationAlert>
  </IonContent>
</template>

<style scoped>
ion-toolbar {
    --background: none;
}
</style>
