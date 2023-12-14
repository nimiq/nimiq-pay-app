<script setup lang="ts">
import { IonAlert, IonButton } from '@ionic/vue'
import { ref, watch } from 'vue'
import { stepEmits } from '@/types/steps'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean } })
const emit = defineEmits(stepEmits)

const phoneNumber = ref('')
const errorMessage = ref('')
interface JSONData { statusCode: number; error: string; message: string }

function handleSubmit() {
  setTimeout(() => emit('done', phoneNumber.value), 200)
}

watch(phoneNumber, () => {
  // If phone number doesn't start with '+'', add it
  if (phoneNumber.value && !phoneNumber.value.startsWith('+'))
    phoneNumber.value = `+${phoneNumber.value}`
})

watch(() => props.errorMsg, () => {
  const { errorMsg } = props
  if (!errorMsg)
    return
  const start_index = errorMsg.indexOf('. Data ') + '. Data '.length
  const json_data_str = errorMsg.substring(start_index)

  let json_data: JSONData
  try {
    json_data = JSON.parse(json_data_str) as JSONData
    errorMessage.value = json_data.message
  }
  catch (error) {
    console.error(`Error parsing JSON: ${(error as Error).message}`)
  }
})
</script>

<template>
  <div class="flex flex-col self-start w-full h-full pt-8">
    <input
      v-model="phoneNumber" placeholder="Your number" type="tel" class="w-full p-2 px-4 my-2 phone"
      size="16"
    >
    <p class="mt-1 text-sm font-semibold text-center text-space/50">
      Standard rates may apply.
    </p>
    <p v-if="errorMessage" class="mx-auto mt-8 text-center text-pumpkin">
      {{ errorMessage }}
    </p>
    <div class="flex flex-col justify-center w-full pb-2 mt-auto">
      <IonButton id="present-alert" size="small" class="text-base font-bold" :disabled="phoneNumber.length < 4">
        Verify
      </IonButton>
      <IonButton v-if="canSkip" fill="clear" class="text-base font-bold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="$emit('skip')">
        Skip for now
      </IonButton>
    </div>
  </div>
  <IonAlert trigger="present-alert" header="Is this your phone number?" :message="phoneNumber" :buttons="[{ text: 'Cancel', handler: () => $emit('focus') }, { text: 'Continue', handler: handleSubmit }]" />
</template>
