<script setup lang="ts">
import { IonAlert, IonButton } from '@ionic/vue'
import { ref } from 'vue'
import { stepEmits } from '@/types/steps'

defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean } })
defineEmits(stepEmits)

const phoneNumber = ref('')
</script>

<template>
  <div class="flex flex-col self-start w-full h-full pt-8">
    <input
      v-model="phoneNumber" placeholder="Your number" type="tel" class="w-full p-2 px-4 my-2 phone"
      size="16"
    >
    <p class="text-sm font-semibold text-space/50">
      You get an SMS. Standard rates may apply. {{ canSkip }}
    </p>
    <div class="flex flex-col justify-center mt-auto pb-6">
      <IonButton id="present-alert" size="small" class="text-base font-bold" :disabled="phoneNumber.length < 4">
        Verify
      </IonButton>
      <IonButton v-if="canSkip" fill="clear" class="text-base font-bold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="$emit('skip')">
        Skip for now
      </IonButton>
    </div>
  </div>
  <IonAlert trigger="present-alert" header="Is this your phone number?" :message="phoneNumber" :buttons="[{ text: 'Cancel', handler: $emit('autofocus') }, { text: 'Continue', handler: () => $emit('done', phoneNumber) }]" />
</template>
