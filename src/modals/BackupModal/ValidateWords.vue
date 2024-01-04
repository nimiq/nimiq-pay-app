<script setup lang="ts">
import { IonBackButton, IonButtons } from '@ionic/vue'
import type { Ref } from 'vue'
import { onMounted, ref } from 'vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { storeToRefs } from 'pinia'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useModal } from '@/composables/useModal'
import { useToast } from '@/composables/useToast'
import { useLocalWallet } from '@/stores/local-wallet'
import { useApp } from '@/stores/app'
import { i18n } from '@/i18n/i18n-setup'

const nav = (document.querySelector('[data-backup-nav]')) as Nav & HTMLElement
const { closeModal } = useModal()
const { setToast } = useToast()
const { getWords } = useLocalWallet()
const { hasDoneBackup } = storeToRefs(useApp())

const successCount = ref(0)
const randomIndex: Ref<number | null> = ref(null)
const usedIndexes: Ref<number[]> = ref([])
const wordsToDisplay: Ref<string[]> = ref([])

async function updateRandomWord() {
  const { data: words, error } = await getWords()
  if (error || !words) {
    // TODO: show error
    console.error(error)
    return
  }
  do
    randomIndex.value = Math.floor(Math.random() * words.length)
  while (usedIndexes.value.includes(randomIndex.value))
  usedIndexes.value.push(randomIndex.value)

  const randomWords: string[] = []
  randomWords.push(words.splice(randomIndex.value, 1)[0])
  for (let i = randomWords.length; i < 6; i++) {
    const index = Math.floor(Math.random() * words.length)
    randomWords.push(words.splice(index, 1)[0])
  }
  // Shuffle array
  randomWords.sort(() => Math.random() - 0.5)
  wordsToDisplay.value = randomWords
}

async function handleGuess(word: string) {
  if (randomIndex.value === null)
    return

  const { data: words, error } = await getWords()
  if (error || !words) {
    // TODO: show error
    console.error(error)
    return
  }
  if (word === words[randomIndex.value]) {
    successCount.value++
  }
  else {
    successCount.value = 0
    usedIndexes.value = []
    // TODO: improve this
    setToast({ message: i18n.t('Wrong word!') })
    setTimeout(() => {
      nav.pop()
    }, 1000)
  }
  if (successCount.value === 3) {
    hasDoneBackup.value = true
    setToast({ message: i18n.t('Back up successful') })
    closeModal()
  }
  else {
    updateRandomWord()
  }
}

onMounted(updateRandomWord)
</script>

<template>
  <ModalTemplate>
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="nav.pop()" />
      </IonButtons>
    </template>
    <template #title>{{ $t('Test your backup') }}</template>
    <div class="flex flex-col h-full gap-y-8">
      <div v-if="randomIndex !== null" class="mt-[40%]">
        <p class="mb-6 text-6xl font-semibold">
          {{ randomIndex + 1 }}
        </p>
        <!-- TODO: show first, second... instead of number -->
        <p class="text-lg font-medium">{{ $t('What\'s the {index}th word?', { index: randomIndex + 1 }) }}</p>
      </div>
      <div class="grid grid-cols-3 gap-4">
        <div v-for="(word, i) in wordsToDisplay" :key="word + i" class="px-4 py-2 font-semibold bg-[#F2F2F4] rounded whitespace-nowrap" @click="() => handleGuess(word)">
          {{ word }}
        </div>
      </div>
    </div>
  </ModalTemplate>
</template>
