import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useLogger } from '../composables/useLogger'

const logger = useLogger('useNaka')

interface Card {
  id: string
  publicKey: string
  expiry: Date
}

export const useNaka = defineStore('naka', () => {
  const card = ref<Card>()

  function setCard(newCard: Card) {
    logger.log('setCard', newCard)
    card.value = newCard
  }

  return {
    card,
    setCard,
  }
})
