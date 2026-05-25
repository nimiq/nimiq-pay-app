<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import HelloWorld from './components/HelloWorld.vue'
import Staking from './components/Staking.vue'
import { useNimiqMiniApp } from './composables/useNimiqMiniApp'

const view = ref('kitchen-sink')
const { provider, isInitializing, initError, initProvider, retryInit } = useNimiqMiniApp()
const deviceIdentifier = shallowRef<string | null>(null)

// Host-selected user language (Nimiq Pay). Falls back to the browser language
// when the mini-app runs outside of Nimiq Pay (e.g. local dev in a regular browser).
const hostLanguage = computed((): string => {
  const hostLang = window.nimiqPay?.language
  if (hostLang)
    return hostLang
  return navigator.language.split('-')[0] || 'en'
})

interface I18nEntry { greeting: string, tagline: string }
const DEFAULT_I18N: I18nEntry = { greeting: 'Hello', tagline: 'Nimiq Pay mini-app starter' }
const I18N: Record<string, I18nEntry> = {
  en: DEFAULT_I18N,
  es: { greeting: 'Hola', tagline: 'Plantilla de mini-app para Nimiq Pay' },
  de: { greeting: 'Hallo', tagline: 'Nimiq Pay Mini-App Starter' },
  fr: { greeting: 'Bonjour', tagline: 'Starter de mini-app Nimiq Pay' },
  pt: { greeting: 'Olá', tagline: 'Modelo de mini-app para Nimiq Pay' },
}
const t = computed<I18nEntry>(() => I18N[hostLanguage.value] ?? DEFAULT_I18N)

async function requestDeviceIdentifier() {
  if (!window.nimiqPay?.requestDeviceIdentifier) {
    deviceIdentifier.value = 'nimiqPay.requestDeviceIdentifier is unavailable in this context'
    return
  }

  try {
    deviceIdentifier.value = await window.nimiqPay.requestDeviceIdentifier({ reason: 'Demo device identifier' })
  }
  catch (err) {
    deviceIdentifier.value = (err as Error).message
  }
}

onMounted(initProvider)
</script>

<template>
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="/vite.svg" class="logo" alt="Vite logo">
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="./assets/vue.svg" class="logo vue" alt="Vue logo">
    </a>
  </div>

  <p data-testid="host-language" style="opacity: 0.7; margin: 0 0 8px;">
    {{ t.greeting }} — {{ t.tagline }} ({{ hostLanguage }})
  </p>
  <p data-testid="device-identifier" style="opacity: 0.7; margin: 0 0 8px;">
    Device Identifier: {{ deviceIdentifier ?? 'not requested' }}
  </p>
  <button type="button" @click="requestDeviceIdentifier">
    Request Device Identifier
  </button>

  <nav style="display: flex; flex-direction: row; justify-content: center; gap: 8px;">
    <button @click="view = 'kitchen-sink'">
      Kitchen Sink
    </button>
    <button @click="view = 'staking'">
      Staking
    </button>
  </nav>

  <HelloWorld
    v-if="view === 'kitchen-sink'"
    :provider="provider"
    :is-initializing="isInitializing"
    :init-error="initError"
    :retry-init="retryInit"
  />
  <Staking
    v-else
    :provider="provider"
    :is-initializing="isInitializing"
    :init-error="initError"
    :retry-init="retryInit"
  />
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
