<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { IonButton } from '@ionic/vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, inputLength: { type: Number, required: true }, backButtonText: { type: String }, stepName: { type: String, required: false } })
const emit = defineEmits(stepEmits)

const { phoneNumber } = storeToRefs(useApp())

const pinCodeInput = ref<string[]>([])

// TODO: access SMS and auto get the access code
function handleInput(payload: Event) {
  const target = payload.target as HTMLInputElement
  const value = target.value
  const index = Number.parseInt(target.id)

  if (value.length > 1) {
    for (let i = 0; i < value.length; i++)
      pinCodeInput.value[index + i] = value[i]
    if (value.length === props.inputLength) {
      emit('done', pinCodeInput.value.join(''))
      return
    }
  }

  if (index === props.inputLength - 1 && value.length === 1) {
    emit('done', pinCodeInput.value.join(''))
  }
  // Focus on the next input
  else {
    const nextInput = document.getElementById(Math.max(value.length, (index + 1)).toString())
    if (nextInput)
      nextInput.focus()
  }
}

function handleBackspace(event: KeyboardEvent) {
  event.preventDefault()
  const target = event.target as HTMLInputElement
  const index = Number.parseInt(target.id)
  if (index > 0 && !target.value) {
    const prevInput = document.getElementById((index - 1).toString())
    if (prevInput) {
      prevInput.focus()
      pinCodeInput.value[index - 1] = ''
    }
  }
}

function handleDelete(event: KeyboardEvent) {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    const target = event.target as HTMLInputElement
    const index = Number.parseInt(target.id)
    pinCodeInput.value[index] = ''
    target.value = ''
  }
}
</script>

<template>
  <p v-if="phoneNumber" class="text-center underline text-pretty opacity-60">
    {{ phoneNumber }}
  </p>
  <div class="flex flex-col items-center justify-center w-full mt-16">
    <div class="flex gap-x-2">
      <input
        v-for="i in inputLength"
        :id="(i - 1).toString()"
        :key="i"
        :aria-label="`Digit ${i}`"
        v-model="pinCodeInput[i - 1]"
        :name="stepName"
        autocomplete="one-time-code"
        class="w-10 p-2 text-2xl font-semibold text-center transition-colors duration-100 border-2 rounded-md focus:outline-none focus:ring-0 focus:border-sky border-space-space-300 h-14"
        type="number"
        inputmode="numeric"
        pattern="[0-9]*"
        @input="handleInput"
        @keydown.backspace="handleBackspace"
        @keydown.delete="handleDelete"
      >
    </div>
    <p class="m-auto text-pumpkin small:min-h-7 tall:min-h-14">
      {{ errorMsg }}
    </p>
    <IonButton
      v-if="backButtonText"
      class="text-base font-semibold normal-case"
      fill="clear"
      @click="$emit('done', 'back')"
    >
      {{ backButtonText }}
    </IonButton>
  </div>
</template>
