<script setup lang="ts">
import { IonAlert, IonButton } from '@ionic/vue'
import { ref } from 'vue'

const emit = defineEmits<{ (e: 'done', value: string): void }>()

const input$ = ref<HTMLInputElement>()
const phoneNumber = ref('')

const alertButtons = [
  { text: 'Cancel', handler: () => setTimeout(() => input$.value!.focus(), 250) },
  { text: 'Continue', handler: () => emit('done', phoneNumber.value) },
]
</script>

<template>
  <div class="self-start mt-8">
    <input
      ref="input$" v-model="phoneNumber" autofocus placeholder="Your number" type="tel" class="w-full p-2 my-2 phone"
      size="16"
    >
    <p class="text-md">
      You get an SMS. Standard rates may apply.
    </p>
    <!-- <IonButton v-if="path === '/setup'" fill="clear" class="mx-4 mt-6 text-xl font-bold" @click="handleClose">
      Skip
    </IonButton> -->
    <IonButton id="present-alert" size="small" class="mx-4 mt-6 text-xl font-bold" :disabled="phoneNumber.length < 4">
      Verify
    </IonButton>
  </div>
  <IonAlert trigger="present-alert" header="Is this your phone number?" :message="phoneNumber" :buttons="alertButtons" />
</template>
