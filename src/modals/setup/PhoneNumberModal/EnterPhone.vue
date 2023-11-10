<script setup lang="ts">
import { IonAlert, IonButton } from '@ionic/vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import type { Alert } from '@ionic/core/dist/types/components/alert/alert'
import { inject, markRaw, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import VerifyPhone from './VerifyPhone.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { BonusWallet } from '@/lib/bonus-wallet'
import { ModalType, useModal } from '@/composables/useModal'

const { showModal } = useModal()
const { path } = useRoute()
const router = useRouter()
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
  showModal(ModalType.EnablePushNotifications)
}

function focusInput() {
  setTimeout(() => {
    phoneInput.value.focus()
  }, 250)
}

onMounted(focusInput)
</script>

<template>
  <ModalTemplate :on-closing="handleClose">
    <template #title>
      Verify your phone number
    </template>
    <template #subtitle>
      It's so easy.
      <br>
      Just verify your phone number.
    </template>
    <div class="flex flex-col self-start w-full h-full pt-8">
      <input
        ref="phoneInput" v-model="phoneNumber" placeholder="Your number" type="tel" class="w-full p-2 px-4 my-2 phone"
        size="16"
      >
      <p class="text-sm font-semibold text-space/50">
        You get an SMS. Standard rates may apply.
      </p>
      <div class="flex flex-col justify-center mt-auto">
        <IonButton id="present-alert" size="small" class="text-base font-bold" :disabled="phoneNumber.length < 4">
          Verify
        </IonButton>
        <IonButton v-if="path === '/setup'" fill="clear" class="text-base font-bold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="handleClose">
          Skip for now
        </IonButton>
      </div>
    </div>
  </ModalTemplate>
  <IonAlert ref="alert" trigger="present-alert" header="Is this your phone number?" :message="phoneNumber" :buttons="alertButtons" />
</template>
