<script setup lang="ts">
import { IonBackButton, IonButtons, IonRow } from '@ionic/vue'
import type { Ref } from 'vue'
import { inject, onMounted, ref } from 'vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { StorageManager } from '@/lib/storage-manager'
import { NimiqWallet } from '@/lib/nimiq-wallet'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useModal } from '@/composables/useModal'

const nav = (document.querySelector('[data-backup-nav]')) as Nav & HTMLElement
const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet
const storageManager = inject(StorageManager.KEY) as StorageManager
const { showNotificationAlert, closeModal } = useModal()

const successCount = ref(0)
const randomIndex: Ref<number | null> = ref(null)
const usedIndexes: Ref<number[]> = ref([])
const wordsToDisplay: Ref<string[]> = ref([])

async function updateRandomWord() {
  const words = await nimiqWallet.getWords()
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

  const words = await nimiqWallet.getWords()
  if (word === words[randomIndex.value]) {
    successCount.value++
  }
  else {
    successCount.value = 0
    usedIndexes.value = []
    // TODO: improve this
    showNotificationAlert({ title: 'Wrong word!' })
    setTimeout(() => {
      nav.pop()
    }, 1000)
  }
  if (successCount.value === 3) {
    storageManager.setBackupDone(true)
    await showNotificationAlert({ title: 'You account is backed up!' })
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
    <template #title>
      Test your backup
    </template>
    <div class="flex flex-col h-full gap-y-8">
      <div v-if="randomIndex !== null" class="mt-[40%]">
        <p class="mb-6 text-6xl font-semibold">
          {{ randomIndex + 1 }}
        </p>
        <!-- TODO: show first, second... instead of number -->
        <p class="text-lg font-medium">
          What's the {{ randomIndex + 1 }}th word?
        </p>
      </div>
      <div class="grid grid-cols-3 gap-4">
        <div v-for="(word, i) in wordsToDisplay" :key="word + i" class="px-4 py-2 font-semibold bg-[#F2F2F4] rounded" @click="() => handleGuess(word)">
          {{ word }}
        </div>
      </div>
    </div>
  </ModalTemplate>
</template>
