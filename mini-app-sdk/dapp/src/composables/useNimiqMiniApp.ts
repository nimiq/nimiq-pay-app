import type { NimiqProvider } from '@nimiq/mini-app-sdk'
import { init } from '@nimiq/mini-app-sdk'
import { computed, ref, shallowRef } from 'vue'

const provider = shallowRef<NimiqProvider | null>(null)
const isInitializing = ref(false)
const initError = ref<string | null>(null)
const hasProvider = computed(() => provider.value !== null)

let pendingInit: Promise<NimiqProvider> | null = null

async function initProvider(): Promise<NimiqProvider> {
  if (provider.value)
    return provider.value

  if (pendingInit)
    return pendingInit

  isInitializing.value = true
  initError.value = null

  pendingInit = init()
    .then((resolvedProvider) => {
      provider.value = resolvedProvider
      provider.value.setRPCUrl('https://rpc.testnet.nimiqwatch.com')
      return resolvedProvider
    })
    .catch((error: unknown) => {
      initError.value = error instanceof Error ? error.message : 'Failed to initialize the Nimiq mini-app provider.'
      throw error
    })
    .finally(() => {
      isInitializing.value = false
      pendingInit = null
    })

  return pendingInit
}

function retryInit(): Promise<NimiqProvider> {
  initError.value = null
  return initProvider()
}

export function useNimiqMiniApp() {
  return {
    provider,
    hasProvider,
    isInitializing,
    initError,
    initProvider,
    retryInit,
  }
}
