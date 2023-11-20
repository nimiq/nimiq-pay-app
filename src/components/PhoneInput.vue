<script setup lang="ts">
import { IonAlert, IonButton } from '@ionic/vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import type { Alert } from '@ionic/core/dist/types/components/alert/alert'
import { inject, markRaw, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const { path } = useRoute()
const phoneInput = ref()
const phoneNumber = ref('')
const alert: Ref<Alert | undefined> = ref()

function handleSubmit() {
  (async () => {
    try {
      // await bonusWallet.authorize(phoneNumber.value)
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
      // focusInput()
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
</script>

<template>
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
      <IonButton v-if="path === '/setup'" fill="clear" class="text-base font-bold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="() => console.log('close')">
        Skip for now
      </IonButton>
    </div>
  </div>
  <IonAlert ref="alert" trigger="present-alert" header="Is this your phone number?" :message="phoneNumber" :buttons="alertButtons" />
</template>
