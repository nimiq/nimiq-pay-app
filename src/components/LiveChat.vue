<script setup lang="ts">
import { onMounted, ref } from 'vue'

const isScriptLoaded = ref(false)

onMounted(async () => {
  const script = document.createElement('script')
  script.src = 'https://js.chatlio.com/widget.js'
  script.async = true
  const loadPromise = new Promise((resolve) => {
    script.onload = () => resolve(true)
  })
  document.body.appendChild(script)

  await loadPromise
  isScriptLoaded.value = true
})

declare global {
  interface Window {
    _chatlio: {
      identify: (userId: string, traits: Record<string, any>) => void
      show: (options?: { expanded: boolean }) => void
    }
  }
}
</script>

<template>
  <chatlio-widget v-if="isScriptLoaded" widgetid="7aa22465-fd98-4f3a-7621-c7a124a3a8cf" />
</template>
