import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLiveChat = defineStore('livechat', () => {
  const enabled = ref(false)
  const shown = ref(false)
  const loading = ref(true)
  const pendingMessageCount = ref(0)

  function reset() {
    enabled.value = false
    shown.value = false
    loading.value = true
    pendingMessageCount.value = 0
  }

  return {
    enabled,
    shown,
    loading,
    pendingMessageCount,
    reset,
  }
})
