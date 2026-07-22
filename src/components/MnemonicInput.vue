<script setup lang="ts">
import type { PluginListenerHandle } from '@capacitor/core'
import type { PropType, Ref } from 'vue'
import { Haptics, NotificationType } from '@capacitor/haptics'
import { Keyboard } from '@capacitor/keyboard'
import { useIntervalFn } from '@vueuse/core'
import Fuse from 'fuse.js'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watchEffect } from 'vue'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'

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
const inputValues: Ref<string[]> = ref(Array.from({ length: 12 }).fill('') as string[])
const wordList = Nimiq.MnemonicUtils.DEFAULT_WORDLIST
const fuse = new Fuse(wordList, { threshold: 1 })
const activeInputIndex = shallowRef(-1)
const activeInputValue = shallowRef('')

const suggestedWords = computed(() => {
  const query = activeInputValue.value
  if (activeInputIndex.value < 0 || !query || wordList.includes(query))
    return []

  const prefixMatches = wordList.filter(word => word.startsWith(query)).slice(0, 3)
  if (prefixMatches.length === 3)
    return prefixMatches

  const prefixSet = new Set(prefixMatches)
  const fuzzyMatches = fuse.search(query, { limit: 6 })
    .map(result => result.item)
    .filter(word => !prefixSet.has(word))
  const rankedMatches = [...prefixMatches, ...fuzzyMatches]
  const rankedSet = new Set(rankedMatches)
  const fallbackMatches = wordList.filter(word => !rankedSet.has(word))

  return [...rankedMatches, ...fallbackMatches].slice(0, 3)
})

watchEffect(() => emit('loginWords', loginWords.value))
let timeout = 0
let keyboardWillHideListener: PluginListenerHandle | undefined
let isUnmounted = false

function getInput(index: number) {
  return document.getElementById((index + 1).toString().padStart(2, '0')) as HTMLInputElement | null
}

function clearInvalidTimeout() {
  if (!timeout)
    return
  clearTimeout(timeout)
  timeout = 0
}

function clearActiveInput() {
  activeInputIndex.value = -1
  activeInputValue.value = ''
}

function distributeTokens(originInput: HTMLInputElement, tokens: string[]) {
  // Full phrase always starts at input 1, partial pastes resume at the focused input.
  const startIndex = tokens.length === 12 ? 0 : Number(originInput.id) - 1
  const count = Math.min(tokens.length, 12 - startIndex)

  for (let i = 0; i < count; i++) {
    const token = tokens[i]
    const targetIndex = startIndex + i
    const targetInput = getInput(targetIndex)
    if (!targetInput)
      continue

    targetInput.value = token
    inputValues.value[targetIndex] = token
    const parent = targetInput.parentElement as HTMLElement | null
    parent?.classList.remove('!text-pumpkin')
    loginWords.value[targetIndex] = wordList.includes(token) ? token : ''
  }

  const nextEmpty = loginWords.value.findIndex(w => !w)
  const focusIndex = nextEmpty === -1 ? 11 : nextEmpty
  const focusInput = getInput(focusIndex)
  focusInput?.focus()
}

function inputHandler(e: Event) {
  clearInvalidTimeout()

  const input = e.target as HTMLInputElement

  // Multi-token input (paste or any value containing separators) — distribute across inputs.
  // WebView paste menu fires `input` with inputType=insertFromPaste, not `paste`, so we detect here.
  const tokens = input.value.toLowerCase().trim().split(/[\s,]+/).filter(Boolean)
  if (tokens.length > 1) {
    input.value = ''
    activeInputValue.value = ''
    distributeTokens(input, tokens)
    return
  }

  // Check if key is space and skip to next input
  if (e instanceof InputEvent && e.data === ' ') {
    const nextInput = document.getElementById((Number(input.id) + 1).toString().padStart(2, '0')) as HTMLInputElement
    if (nextInput)
      nextInput.focus()
    return
  }

  // Get parent element
  const parent = input.parentElement as HTMLElement
  const value = input.value.toLowerCase().trim()
  const index = Number(input.id) - 1
  inputValues.value[index] = value
  activeInputIndex.value = index
  activeInputValue.value = value

  if (parent.classList.contains('!text-pumpkin'))
    parent.classList.remove('!text-pumpkin')
  if (value === '') {
    loginWords.value[index] = ''
    return
  }

  // Wait if user is still typing
  if (wordList.includes(value)) {
    loginWords.value[index] = value
  }
  else {
    loginWords.value[index] = ''
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

function handleFocus(index: number, event: FocusEvent) {
  activeInputIndex.value = index
  activeInputValue.value = (event.target as HTMLInputElement).value.toLowerCase().trim()
}

function selectSuggestion(word: string) {
  const selectedIndex = activeInputIndex.value
  const input = getInput(selectedIndex)
  if (!input)
    return

  clearInvalidTimeout()
  inputValues.value[selectedIndex] = word
  input.classList.remove('animate-wiggle')
  input.parentElement?.classList.remove('!text-pumpkin')
  loginWords.value[selectedIndex] = word
  activeInputValue.value = ''

  nextTick(() => {
    const indices = Array.from({ length: 12 }, (_, index) => index)
    const nextEmptyIndex = indices.find(index => index > selectedIndex && !loginWords.value[index])
      ?? indices.find(index => !loginWords.value[index])
    if (nextEmptyIndex !== undefined)
      getInput(nextEmptyIndex)?.focus()
  })
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
  void Keyboard.addListener('keyboardWillHide', clearActiveInput).then(async (listener) => {
    if (isUnmounted)
      await listener.remove()
    else
      keyboardWillHideListener = listener
  }).catch(error => logger.error('Failed to add keyboard listener', error))
  if (useDevice().isIOS)
    Keyboard.setAccessoryBarVisible({ isVisible: false })
})
onUnmounted(() => {
  isUnmounted = true
  clearInvalidTimeout()
  void keyboardWillHideListener?.remove()
  if (useDevice().isIOS)
    Keyboard.setAccessoryBarVisible({ isVisible: true })
  pause()
})
</script>

<template>
  <div>
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
          :value="word || inputValues[i]"
          :disabled="!!word"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          @focus="handleFocus(i, $event)"
          @input="inputHandler"
        >
      </div>
    </div>

    <div
      v-if="suggestedWords.length"
      data-testid="mnemonic-suggestions"
      class="fixed inset-x-0 bottom-0 z-20 border-t border-space/10 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <div class="mx-auto flex max-w-md divide-x divide-space/10 px-2">
        <button
          v-for="suggestion in suggestedWords"
          :key="suggestion"
          type="button"
          data-testid="mnemonic-suggestion"
          class="min-h-11 min-w-0 flex-1 truncate px-2 text-base font-semibold text-space transition-colors hover:bg-space/[0.06] active:bg-space/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky"
          @pointerdown.prevent
          @click="selectSuggestion(suggestion)"
        >
          {{ suggestion }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
input, input:disabled {
  @apply border-0 outline-none py-1 font-medium w-full bg-transparent;
}
</style>
