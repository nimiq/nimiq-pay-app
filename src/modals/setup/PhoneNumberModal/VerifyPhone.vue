<script setup lang="ts">
import { inject, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { IonBackButton, IonButton, IonButtons, IonContent, IonGrid, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { useRoute } from 'vue-router'
import { BonusWallet } from '@/lib/bonus-wallet'
import { ModalType, useModal } from '@/composables/useModal'

const { showModal, closeModal, showNotificationAlert } = useModal()
const { path } = useRoute()
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const codeField = ref()
const prefill = bonusWallet.getPrefillAccessCode()
const code: Ref<number | null> = ref(Number(prefill))
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
      await showNotificationAlert({ title: 'CC Points is now active!' })
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

function handleClose() {
  if (path === '/setup')
    showModal(ModalType.EnablePushNotifications)

  else
    closeModal()
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
        <IonButton @click="handleClose">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent class="text-center ion-padding">
    <!-- TODO: redo this -->
    <IonGrid class="mx-6">
      <h1 class="mb-4 text-2xl font-bold">
        Confirm your phone number
      </h1>
      <p class="mb-8 text-base font-normal">
        We've sent you a code, please confirm.
      </p>
      <input
        ref="codeField" type="number" inputmode="numeric" pattern="[0-9]*" minlength="8"
        maxlength="8" class="w-full p-1 my-10 text-3xl tracking-widest text-center" autofocus="true"
        :value="code" @input="code = Number(($event.target as HTMLTextAreaElement).value)"
      >
      <IonButton v-if="path === '/setup'" fill="clear" class="mx-4 mt-6 text-base font-semibold text-sky" @click="handleResendRequest">
        Resend
      </IonButton>
      <IonButton size="small" class="mx-4 mt-6 text-base font-semibold" :disabled="(code || '').toString().length !== 8" @click="handleVerify">
        Verify
      </IonButton>
    </IonGrid>
  </IonContent>
</template>

<style scoped>
ion-toolbar {
    --background: none;
}
</style>
