// TODO This store is a temporary and should be removed once the merge with the logic code is done

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

interface NakaCard {
  id: string
  name: string
  cardNumber: string
  cvv: string
  expiryDate: string
}

export const useNakaCardWithWeirdNameSoIsEasyToReplace = defineStore('useNakaCardWithWeirdNameSoIsEasyToReplace', () => {
  const nakaCardLongName = ref<NakaCard>()

  function setNakaCard() {
    nakaCardLongName.value = {
      id: 'fake',
      cardNumber: '1234 5678 9012 3456',
      cvv: '123',
      expiryDate: '12/20',
      name: 'Fake name',
    }
  }

  const hasNakaCardLongName = computed(() => !!nakaCardLongName.value?.id)

  return {
    setNakaCard,
    nakaCardLongName,
    hasNakaCardLongName,
  }
})
