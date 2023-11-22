<script setup lang="ts">
import { ref, watch } from 'vue'
import { stepEmits } from '@/types/steps'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, inputLength: { type: Number, required: true } })
const emit = defineEmits(stepEmits)

const inputRef = ref<HTMLInputElement | null>(null)
const pinCodeInput = ref('')

watch(pinCodeInput, (pin) => {
  if (pin.length === props.inputLength)
    emit('done', pin)
})

function handleInputClick(i: number) {
  //
  if (pinCodeInput.value.length > 0)
    pinCodeInput.value = pinCodeInput.value.slice(0, -(pinCodeInput.value.length - i) - 1)
  inputRef?.value?.focus()

  inputRef.value?.focus()
}
</script>

<template>
  <div class="mt-28 mx-auto">
    <div class="flex gap-x-8 mt-28 mx-auto justify-center">
      <div v-for="i in inputLength" :key="i" class="w-4 h-4 transition-colors rounded-full bg-space" :title="i.toString()" :class="{ 'opacity-40': pinCodeInput.length < i }" @click="handleInputClick(i)" />
    </div>
    <p v-if="errorMsg" class="text-tomato text-center">
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
