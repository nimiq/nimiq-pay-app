<script setup lang="ts">
import { IonButton, alertController } from '@ionic/vue'
import { ref, watch } from 'vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { i18n } from '@/i18n/i18n-setup'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean } })
const emit = defineEmits(stepEmits)

const phoneNumber = ref('')
const errorMessage = ref('')

function showAlert() {
  alertController
    .create({
      header: i18n.t('Is this your phone number?'),
      message: phoneNumber.value,
      buttons: [
        { text: i18n.t('Cancel'), handler: () => emit('focus') },
        { text: i18n.t('Continue'), handler: handleSubmit },
      ],
    })
    .then(alert => alert.present())
}

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
  if (!errorMsg) {
    errorMessage.value = ''
    return
  }

  // Try to parse server error message from message prop in server response json in (potentially translated) api() error
  // message. Note that the server error message itself has also been translated on the server.
  const serverErrorMessageMatch = errorMsg.match(/"message":\s*("(?:\\"|[^"])+")/i)
  errorMessage.value = serverErrorMessageMatch
    ? JSON.parse(serverErrorMessageMatch[1]) as string // decode json encoded message string, resolving potential escape sequences
    : errorMsg
})
</script>

<template>
  <div class="flex flex-col self-start w-full h-full mt-8">
    <form @submit.prevent>
      <input
        v-model="phoneNumber" :placeholder="$t('Your number')" type="tel" class="w-full p-2 px-4 my-2 phone"
        size="16"
        @keydown.enter="showAlert"
      >
    </form>
    <p class="mt-1 text-sm font-semibold text-center text-space/50">
      {{ $t('Standard rates may apply.') }}
    </p>
    <p v-if="errorMessage" class="mx-auto mt-8 text-center text-pumpkin">
      {{ errorMessage }}
    </p>
    <div class="flex flex-col justify-center w-full pb-2 mt-auto">
      <IonButton size="small" class="text-base font-bold" :disabled="phoneNumber.length < 4" @click="showAlert">
        {{ $t('Verify') }}
      </IonButton>
      <IonButton v-if="canSkip" fill="clear" class="text-base font-bold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="$emit('skip')">
        {{ $t('Skip for now') }}
      </IonButton>
    </div>
  </div>
</template>
