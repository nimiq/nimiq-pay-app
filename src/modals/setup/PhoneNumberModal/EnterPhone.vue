<script setup lang="ts">
import { IonAlert, IonButton } from '@ionic/vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import type { Alert } from '@ionic/core/dist/types/components/alert/alert'
import { inject, markRaw, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { useRoute } from 'vue-router'
import VerifyPhone from './VerifyPhone.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { BonusWallet } from '@/lib/bonus-wallet'
import { Modal, useModal } from '@/composables/useModal'

const { showModal } = useModal()
const { path } = useRoute()
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const phoneInput = ref()
const phoneNumber = ref('')
const alert: Ref<Alert | undefined> = ref()
const nav = (document.querySelector('[data-phone-nav]')) as Nav & HTMLElement

function handleSubmit() {
  (async () => {
    try {
      await bonusWallet.authorize(phoneNumber.value)
      nav.push(markRaw(VerifyPhone))
    }
    catch (e: any) {
      phoneInput.value.setCustomValidity(e.message || e)
      phoneInput.value.reportValidity()
    }
  })()
  return false
}

enum AlertRole {
  Cancel,
  Confirm,
}
const alertButtons = [
  {
    text: 'Cancel',
    role: AlertRole.Cancel,
    handler: () => {
      focusInput()
    },
  },
  {
    text: 'Continue',
    role: AlertRole.Confirm,
    handler: () => {
      handleSubmit()
    },
  },
]

function handleClose() {
  showModal(Modal.EnablePushNotifications)
}

function focusInput() {
  setTimeout(() => {
    phoneInput.value.focus()
  }, 250)
}

onMounted(focusInput)
</script>

<template>
  <ModalTemplate>
    <template #title>
      Verify your phone number
    </template>
    <template #subtitle>
      It's so easy. Just verify your phone number.
    </template>
    <div class="self-start mt-8">
      <form @submit.prevent="() => alert?.present()">
        <input
          ref="phoneInput" v-model="phoneNumber" placeholder="Your number" type="tel" class="w-full p-2 my-2 phone"
          size="16"
        >
      </form>
      <p class="text-md">
        You get an SMS. Standard rates may apply.
      </p>
      <IonButton v-if="path === '/setup'" fill="clear" class="mx-4 mt-6 text-xl font-bold" @click="handleClose">
        Skip
      </IonButton>
      <IonButton id="present-alert" size="small" class="mx-4 mt-6 text-xl font-bold" :disabled="phoneNumber.length < 4">
        Verify
      </IonButton>
    </div>
  </ModalTemplate>
  <IonAlert ref="alert" trigger="present-alert" header="Is this your phone number?" :message="phoneNumber" :buttons="alertButtons" />
</template>
