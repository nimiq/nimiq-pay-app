<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  inputLength: number
}>()

const emit = defineEmits({
  done: (_pin: string) => true,
})

const inputRef = ref<HTMLInputElement | null>(null)
const pinCodeInput = ref('')

watch(pinCodeInput, (pin) => {
  if (pin.length === props.inputLength)
    emit('done', pin)
})

function focusInput() {
  inputRef?.value?.focus()
}

function handleInputClick(i: number) {
  //
  if (pinCodeInput.value.length > 0)
    pinCodeInput.value = pinCodeInput.value.slice(0, -(pinCodeInput.value.length - i) - 1)

  focusInput()
}

onMounted(() => setTimeout(focusInput, 200))
</script>

<template>
  <div class="mt-28">
    <div class="flex gap-x-8">
      <div v-for="i in inputLength" :key="i" class="w-4 h-4 transition-colors rounded-full bg-space" :title="i.toString()" :class="{ 'opacity-40': pinCodeInput.length < i }" @click="handleInputClick(i)" />
    </div>
    <input
      ref="inputRef" type="password" inputmode="numeric" class="absolute opacity-0 -top-40" pattern="[0-9]*"
      :minlength="inputLength" :maxlength="inputLength" :size="inputLength"
      :value="pinCodeInput"
      @input="pinCodeInput = ($event.target as HTMLTextAreaElement).value"
    >
  </div>
</template>
