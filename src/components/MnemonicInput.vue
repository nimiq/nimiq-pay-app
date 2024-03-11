<script setup lang="ts">
import { type PropType, type Ref, ref, watchEffect } from 'vue'

defineProps({
  recoveryWords: {
    type: Array as PropType<string[]>,
    default: () => Array.from({ length: 12 }).fill(''),
  },
})

const emit = defineEmits<{
  (e: 'loginWords', words: string[]): void
}>()

const loginWords: Ref<string[]> = ref([])
const wordList = Nimiq.MnemonicUtils.DEFAULT_WORDLIST

watchEffect(() => emit('loginWords', loginWords.value))
let timeout = 0
function inputHandler(e: Event) {
  timeout && clearTimeout(timeout)

  const input = e.target as HTMLInputElement
  const value = input.value.toLowerCase().trim()
  const index = Number(input.placeholder) - 1

  if (input.classList.contains('text-pumpkin'))
    input.classList.remove('text-pumpkin')
  if (value === '') {
    loginWords.value[index] = ''
    return
  }
  // Wait if user is still typing
  // TODO: Jump to next word if valid
  if (wordList.includes(value)) {
    loginWords.value[index] = value
  }
  else {
    timeout = window.setTimeout(() => {
      input.classList.add('animate-wiggle')
      input.classList.add('text-pumpkin')
      window.setTimeout(() => {
        input.classList.remove('animate-wiggle')
      }, 1000)
    }, 2000)
  }
}
</script>

<template>
  <div class="grid grid-cols-3 gap-2">
    <input
      v-for="(word, i) in recoveryWords"
      :key="word + i"
      name="recovery-word"
      tabindex="0"
      class="lowercase"
      type="text"
      :value="word"
      :disabled="!!word"
      :placeholder="(i + 1).toString().padStart(2, '0')"
      autocomplete="off"
      autocorrect="off"
      @input="inputHandler"
    >
  </div>
</template>

<style scoped>
input, input:disabled{
  @apply bg-[#F2F2F4] border-0 outline-none py-1 px-2 text-center opacity-100 font-semibold placeholder:text-space-space-500/40;
}
</style>
