<script setup lang="ts">
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { Haptics, NotificationType } from '@capacitor/haptics'
import { Keyboard } from '@capacitor/keyboard'
import { useIntervalFn } from '@vueuse/core'
import { onMounted, onUnmounted, type PropType, type Ref, ref, watchEffect } from 'vue'

defineProps({
  recoveryWords: {
    type: Array as PropType<string[]>,
    default: () => Array.from({ length: 12 }).fill(''),
  },
})

const emit = defineEmits<{
  (e: 'loginWords', words: string[]): void
}>()

const logger = useLogger('MnemonicInput')
const loginWords: Ref<string[]> = ref([])
const wordList = Nimiq.MnemonicUtils.DEFAULT_WORDLIST

watchEffect(() => emit('loginWords', loginWords.value))
let timeout = 0
function inputHandler(e: Event) {
  timeout && clearTimeout(timeout)

  const input = e.target as HTMLInputElement
  // Get parent element
  const parent = input.parentElement as HTMLElement
  const value = input.value.toLowerCase().trim()
  const index = Number(input.id) - 1

  if (parent.classList.contains('!text-pumpkin'))
    parent.classList.remove('!text-pumpkin')
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
      parent.classList.add('!text-pumpkin')
      try {
        Haptics.notification({ type: NotificationType.Warning })
      }
      catch (error) {
        logger.error('Failed to trigger haptic feedback', error)
      }
      window.setTimeout(() => {
        input.classList.remove('animate-wiggle')
      }, 1000)
      // Clear value
      loginWords.value[index] = ''
    }, 2000)
  }
}

// Check if already inputted words are correct since the inputHandler only checks the current word
// This is needed in case the user is writing too fast and skipping the check on a previous word
const { pause, resume } = useIntervalFn(() => {
  for (let i = 0; i < loginWords.value.length; i++) {
    const word = loginWords.value[i]
    if (!wordList.includes(word)) {
      const input = document.getElementById((i + 1).toString().padStart(2, '0')) as HTMLInputElement
      // If input has focus, do nothing
      if (document.activeElement === input)
        return
      // Check if input is empty, if not it means the word is not valid
      const inputValue = input.value.toLowerCase().trim()
      if (inputValue === '')
        continue

      const parent = input.parentElement as HTMLElement

      // If it already has the text-pumpkin class, do nothing
      if (parent.classList.contains('!text-pumpkin'))
        continue

      input.classList.add('animate-wiggle')
      parent.classList.add('!text-pumpkin')
      try {
        Haptics.notification({ type: NotificationType.Warning })
      }
      catch (error) {
        logger.error('Failed to trigger haptic feedback', error)
      }
      window.setTimeout(() => {
        input.classList.remove('animate-wiggle')
      }, 1000)
    }
  }
}, 1000, { immediate: true })

onMounted(() => {
  resume()
  if (useDevice().isIOS)
    Keyboard.setAccessoryBarVisible({ isVisible: false })
})
onUnmounted(() => {
  if (useDevice().isIOS)
    Keyboard.setAccessoryBarVisible({ isVisible: true })
  pause()
})
</script>

<template>
  <div class="grid grid-cols-2 gap-2">
    <div
      v-for="(word, i) in recoveryWords" :key="word + i"
      class="border-opacity-30 border-space flex items-center gap-2 px-3 py-1 rounded border-2 transition-colors focus-within:border-sky focus-within:border-opacity-30 focus-within:text-sky"
    >
      <span class="font-semibold opacity-40">{{ (i + 1).toString().padStart(2, '0') }}</span>
      <input
        :id="(i + 1).toString().padStart(2, '0')"
        name="recovery-word"
        tabindex="0"
        class="lowercase"
        type="email"
        :value="word"
        :disabled="!!word"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        @input="inputHandler"
      >
    </div>
  </div>
</template>

<style scoped>
input, input:disabled {
  @apply border-0 outline-none py-1 font-medium w-full bg-transparent;
}
</style>
