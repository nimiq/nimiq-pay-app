<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import QuickButton from '@/components/QuickButton.vue'

const emit = defineEmits<{ done: []; back: [] }>()

const logger = useLogger('ValidateWords')

const QUESTION_COUNT = 3

/**
 * After showing the user the 12 words, we ask the user to write them down.
 * Then, we ask to the user 3 words.
 * For each word, the user will select the correct word from a list of 6 words.
 */
type Word = [number /* index */, string /* word */]
interface TestWord {
  // The word to guess
  correctWord: Word
  // The list of words to choose from. We include the correct word in the list
  options: Word[]
}
const randomWords = ref<TestWord[]>([])

/**
 * Selects `amount` random words from the given array.
 * We use a Set to avoid duplicates.
 */
function getRandomWords(words: string[], amount: number): Word[] {
  const selectedIndices = new Set<number>()
  while (selectedIndices.size < amount)
    selectedIndices.add(Math.floor(Math.random() * words.length))
  return Array.from(selectedIndices).map(index => [index, words[index]])
}

async function setRandomWords() {
  const { data: words, error } = await useLocalWallet().getWords()
  if (error)
    logger.error(error)

  // Select QUESTION_COUNT random indices from the list of words sorted in ascending order
  const testWords = getRandomWords(words!, QUESTION_COUNT).sort((a, b) => a[0] - b[0])

  for (const word of testWords) {
    // remove the correct word from the list of words
    const wordsCopy = [...words!]
    wordsCopy.splice(word[0], 1)
    const options = getRandomWords(wordsCopy, 5)
    options.splice(Math.floor(Math.random() * 6), 0, word) // put the the correct word in a random position
    randomWords.value.push({ correctWord: word, options })
  }
}

onMounted(() => {
  setRandomWords()
})

const successCount = ref(0)
const activeWord = computed(() => randomWords.value.length > 0 ? randomWords.value[successCount.value] : undefined)

const randomIndexInstructions = computed(() => {
  // List all possible strings for translation in full, because different languages have all different kinds of rules
  // for how to build ordinals (see https://www.unicode.org/cldr/charts/43/supplemental/language_plural_rules.html),
  // where the suffix, prefix, article etc. can change depending on the number, such that it's easiest to simply list
  // all sentences in full.
  const activeIndex = activeWord.value?.correctWord[0]
  switch (activeIndex) {
    case null: return ''
    case 0: return i18n.t('What\'s the 1st word?')
    case 1: return i18n.t('What\'s the 2nd word?')
    case 2: return i18n.t('What\'s the 3rd word?')
    case 3: return i18n.t('What\'s the 4th word?')
    case 4: return i18n.t('What\'s the 5th word?')
    case 5: return i18n.t('What\'s the 6th word?')
    case 6: return i18n.t('What\'s the 7th word?')
    case 7: return i18n.t('What\'s the 8th word?')
    case 8: return i18n.t('What\'s the 9th word?')
    case 9: return i18n.t('What\'s the 10th word?')
    case 10: return i18n.t('What\'s the 11th word?')
    case 11: return i18n.t('What\'s the 12th word?')
  }
  throw new Error(`Unexpected index ${activeIndex}`)
})

const lastSelected = ref('')
const hasError = ref(false)

async function handleGuess(word: string) {
  lastSelected.value = word
  if (!activeWord.value)
    return

  if (word !== activeWord.value.correctWord[1]) {
    hasError.value = true
    return
  }

  successCount.value++
  if (successCount.value === QUESTION_COUNT)
    emit('done')
}

function reset() {
  hasError.value = false
  successCount.value = 0
  randomWords.value = []
  setRandomWords()
}

function seeWords() {
  emit('back')
  setTimeout(reset, 300)
}
</script>

<template>
  <div v-if="activeWord" class="flex flex-col items-center w-full h-full mt-2">
    <p class="text-6xl font-semibold" :class="hasError ? 'opacity-70' : ''">
      {{ (activeWord.correctWord[0] + 1).toLocaleString() }}
    </p>
    <p class="text-lg font-medium text-space/70 mt-2" :class="hasError ? 'opacity-70' : ''">
      {{ randomIndexInstructions }}
    </p>
    <div class="grid grid-cols-3 gap-4 mt-8">
      <button v-for="([, word]) in activeWord.options" :key="word" :disabled="hasError" class="px-4 py-2 font-semibold bg-[#F2F2F4] rounded whitespace-nowrap disabled:opacity-40" @click="() => handleGuess(word)">
        {{ word }}
      </button>
    </div>
    <div v-if="hasError" class="mt-8 animate-slideUpAndFade w-full">
      <p class="text-tomato font-semibold text-sm">
        {{ $t('You have chosen "{selected}".', { selected: lastSelected }) }}
      </p>
      <p class="text-space/70 font-semibold text-sm">
        {{ $t('The correct answer is "{correct}".', { correct: activeWord.correctWord[1] }) }}
      </p>
      <p class="text-space/70 mt-2 font-semibold text-sm">
        {{ $t('What do you want to do?') }}
      </p>
      <div class="flex gap-x-4 justify-around mt-2">
        <QuickButton show-chevron center @click="reset">
          {{ $t('Try again') }}
        </QuickButton>
        <QuickButton show-chevron center @click="seeWords">
          {{ $t('See words') }}
        </QuickButton>
      </div>
    </div>
  </div>
</template>
