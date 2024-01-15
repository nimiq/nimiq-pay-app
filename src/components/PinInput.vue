<script setup lang="ts">
import { ref, watch } from 'vue'
import { stepEmits } from '@/lib/flows/steps.types'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, inputLength: { type: Number, required: true } })
const emit = defineEmits(stepEmits)

const inputRef = ref<HTMLInputElement | null>(null)
const pinCodeInput = ref('')
const wiggle = ref(false)

watch(pinCodeInput, (pin) => {
  if (pin.length === props.inputLength) {
    wiggle.value = false
    emit('done', pin)
  }
})

watch(() => props.errorMsg, (msg) => {
  if (msg) {
    wiggle.value = true
    pinCodeInput.value = ''
  }
})

function handleInputClick(i: number) {
  if (pinCodeInput.value.length > 0)
    pinCodeInput.value = pinCodeInput.value.slice(0, -(pinCodeInput.value.length - i) - 1)
  inputRef.value?.focus()
}
</script>

<template>
  <div class="m-auto">
    <div class="flex justify-center px-2 py-4 mx-auto gap-x-8" :class="{ 'animate-wiggle': wiggle }" @click="inputRef?.focus()">
      <div v-for="i in inputLength" :key="i" class="w-4 h-4 transition-colors rounded-full bg-space" :title="i.toString()" :class="{ 'opacity-40': pinCodeInput.length < i }" @click="handleInputClick(i)" />
    </div>
    <p v-if="errorMsg" class="mt-12 text-base text-center text-pumpkin">
      {{ errorMsg }}
    </p>
  </div>
  <input
    ref="inputRef" type="password" inputmode="numeric" class="sr-only" pattern="[0-9]*"
    :minlength="inputLength" :maxlength="inputLength" :size="inputLength"
    :value="pinCodeInput"
    @input="pinCodeInput = ($event.target as HTMLTextAreaElement).value"
  >
</template>
