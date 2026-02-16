<script setup lang="ts">
import { InAppBrowser, ToolBarType } from '@capgo/inappbrowser'
import { IonInput } from '@ionic/vue'
import { computedAsync } from '@vueuse/core'
import { computed, ref } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { MiniAppHost } from '@/composables/useMiniAppHost'
import { useToast } from '@/composables/useToast'
import { getAppIcon, requestUserConfirmation } from '@/lib/mini-app-confirmation'
import { useLocalWallet } from '@/stores/local-wallet'

const logger = useLogger('MiniAppModal')
const localWallet = useLocalWallet()
const ethereumRpcUrl = import.meta.env.VITE_ETHEREUM_RPC_URL

const ethAddress = computed(() => {
  const { data, error } = localWallet.getEthAddress()
  if (error) {
    logger.error('Failed to get ETH address:', error)
    return null
  }
  logger.log('ETH address:', data)
  return data
})

// Pre-cache web3-provider script for instant injection when opening mini-apps
const web3ProviderScript = computedAsync(
  () => fetch('/web3-provider.js').then(res => res.text()),
  null,
)

interface DApp {
  name: string
  url: string
  icon: string
}

const popularDApps: DApp[] = [
  {
    name: 'Uniswap',
    url: 'https://app.uniswap.org',
    icon: getAppIcon('https://app.uniswap.org'),
  },
  {
    name: 'Polymarket',
    url: 'https://polymarket.com',
    icon: getAppIcon('https://polymarket.com'),
  },
  {
    name: 'DappRadar',
    url: 'https://dappradar.com',
    icon: getAppIcon('https://dappradar.com'),
  },
  {
    name: 'Aave',
    url: 'https://app.aave.com',
    icon: getAppIcon('https://app.aave.com'),
  },
  {
    name: 'OpenSea',
    url: 'https://opensea.io',
    icon: getAppIcon('https://opensea.io'),
  },
  {
    name: '1inch',
    url: 'https://app.1inch.io',
    icon: getAppIcon('https://app.1inch.io'),
  },
]

const miniAppUrl = ref(`http://${__VITE_SERVER_IP__}:5174`)

async function openMiniApp(url?: string, title?: string) {
  const targetUrl = url || miniAppUrl.value
  const appTitle = title || 'Mini App'

  // Create the mini app host with configuration
  const host = new MiniAppHost(InAppBrowser, {
    url: targetUrl,
    title: appTitle,
    requestUserConfirmation,
    ethereumRpcUrl,
  })

  // TODO: Webview opening and lifecycle handling could be moved into the MiniAppHost class constructor
  // Use pre-cached script if available, fallback to fetch if not yet loaded
  const cachedScript = web3ProviderScript.value
  const scriptContent = cachedScript !== null ? cachedScript : await fetch('/web3-provider.js').then(res => res.text())

  await InAppBrowser.openWebView({
    url: targetUrl,
    title: appTitle,
    toolbarType: ToolBarType.NAVIGATION,
    preventDeeplink: true,
    showReloadButton: true,
    enabledSafeBottomMargin: true,
    useTopInset: true,
    activeNativeNavigationForWebview: true,
    isPresentAfterPageLoad: true,
    preShowScript: scriptContent,
    preShowScriptInjectionTime: 'documentStart',
  }).catch((err) => {
    logger.error('Failed to open mini-app:', err)
    useToast().setToast({
      message: 'Could not open the mini-app webview',
      type: 'error',
    })
  })

  InAppBrowser.addListener('closeEvent', async () => {
    logger.log('Mini-app webview closed, destroying host')
    await host.destroy()
  })
}
</script>

<template>
  <ModalTemplate :close-all="true">
    <div class="w-full h-full flex flex-col gap-6">
      <p class="text-space/60 text-sm font-bold text-left uppercase">
        Mini Apps
      </p>

      <!-- ETH Address Display -->
      <div v-if="ethAddress" class="bg-white/5 rounded-lg p-3">
        <p class="text-xs text-space/60 uppercase mb-1">
          ETH Address
        </p>
        <p class="text-sm font-mono break-all">
          {{ ethAddress }}
        </p>
      </div>

      <!-- Popular dApps Grid -->
      <div class="grid grid-cols-3 gap-4">
        <button
          v-for="dapp in popularDApps"
          :key="dapp.url"
          class="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors"
          @click="openMiniApp(dapp.url, dapp.name)"
        >
          <img
            :src="dapp.icon"
            :alt="dapp.name"
            class="w-12 h-12 rounded-xl object-contain bg-white/10 p-1"
            @error="($event.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>'"
          >
          <span class="text-xs text-center font-medium truncate w-full">{{ dapp.name }}</span>
        </button>
      </div>

      <!-- Custom URL Section -->
      <div class="border-t border-white/10 pt-4">
        <form class="flex flex-col gap-3" @submit.prevent="openMiniApp()">
          <label class="text-xs font-medium text-space/60 uppercase">
            Custom URL
          </label>
          <IonInput
            v-model="miniAppUrl"
            placeholder="Enter URL"
            clear-input
            class="bg-white/5 rounded-lg"
          />
          <button
            type="submit"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            :disabled="!miniAppUrl"
          >
            Open
          </button>
        </form>
      </div>
    </div>
  </ModalTemplate>
</template>

<style scoped>
</style>
