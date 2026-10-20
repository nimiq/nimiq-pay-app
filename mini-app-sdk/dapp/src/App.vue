<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import HelloWorld from './components/HelloWorld.vue'
import Staking from './components/Staking.vue'
import { useNimiqMiniApp } from './composables/useNimiqMiniApp'

const view = ref('kitchen-sink')
const { provider, isInitializing, initError, initProvider, retryInit } = useNimiqMiniApp()
const deviceIdentifier = shallowRef<string | null>(null)
const isFullscreen = shallowRef<boolean | null>(null)
const fullscreenError = shallowRef('')
let stopFullscreenChanges: (() => void) | undefined

// Host-selected user language (Nimiq Pay). Falls back to the browser language
// when the mini-app runs outside of Nimiq Pay (e.g. local dev in a regular browser).
const hostLanguage = computed((): string => {
  const hostLang = window.nimiqPay?.language
  if (hostLang)
    return hostLang
  return navigator.language.split('-')[0] || 'en'
})

// Host-selected fiat currency (Nimiq Pay). Falls back to USD outside of Nimiq Pay.
const hostFiat = computed((): string => window.nimiqPay?.userFiat ?? 'USD')

// Nimiq network Nimiq Pay runs on. Falls back to mainnet outside of Nimiq Pay.
const hostNetwork = computed((): string => window.nimiqPay?.network ?? 'mainnet')

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

async function refreshFullscreen() {
  if (!window.nimiqPay?.getFullscreen) {
    fullscreenError.value = 'Fullscreen is unavailable outside Nimiq Pay'
    return
  }
  try {
    isFullscreen.value = await window.nimiqPay.getFullscreen()
    fullscreenError.value = ''
  }
  catch (error) {
    fullscreenError.value = (error as Error).message
  }
}

async function enterFullscreen() {
  if (!window.nimiqPay?.requestFullscreen) {
    fullscreenError.value = 'Fullscreen is unavailable outside Nimiq Pay'
    return
  }
  try {
    await window.nimiqPay.requestFullscreen()
    await refreshFullscreen()
  }
  catch (error) {
    fullscreenError.value = (error as Error).message
  }
}

async function leaveFullscreen() {
  if (!window.nimiqPay?.exitFullscreen) {
    fullscreenError.value = 'Fullscreen is unavailable outside Nimiq Pay'
    return
  }
  try {
    await window.nimiqPay.exitFullscreen()
    await refreshFullscreen()
  }
  catch (error) {
    fullscreenError.value = (error as Error).message
  }
}

onMounted(initProvider)
onMounted(() => {
  stopFullscreenChanges = window.nimiqPay?.onFullscreenChange?.((enabled) => {
    isFullscreen.value = enabled
  })
  void refreshFullscreen()
})
onBeforeUnmount(() => stopFullscreenChanges?.())
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
  <p data-testid="host-fiat" style="opacity: 0.7; margin: 0 0 8px;">
    Fiat: {{ hostFiat }}
  </p>
  <p data-testid="host-network" style="opacity: 0.7; margin: 0 0 8px;">
    Network: {{ hostNetwork }}
  </p>
  <p data-testid="device-identifier" style="opacity: 0.7; margin: 0 0 8px;">
    Device Identifier: {{ deviceIdentifier ?? 'not requested' }}
  </p>
  <button type="button" @click="requestDeviceIdentifier">
    Request Device Identifier
  </button>

  <p data-testid="fullscreen-state" style="opacity: 0.7; margin: 8px 0;">
    Fullscreen: {{ isFullscreen === null ? 'unknown' : isFullscreen ? 'on' : 'off' }}
  </p>
  <p v-if="fullscreenError" data-testid="fullscreen-error" role="alert">
    {{ fullscreenError }}
  </p>
  <button type="button" @click="enterFullscreen">Go Fullscreen</button>
  <button type="button" @click="leaveFullscreen">Exit Fullscreen</button>
  <button type="button" @click="refreshFullscreen">Refresh Fullscreen State</button>

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
