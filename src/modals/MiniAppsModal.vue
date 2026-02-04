<script setup lang="ts">
import type { UserConfirmationRequest } from '@/composables/useMiniAppHost'
import { InAppBrowser, ToolBarType } from '@capgo/inappbrowser'
import { IonInput } from '@ionic/vue'
import { ExtendedDialog } from 'capacitor-extended-dialog'
import { formatEther } from 'ethers'
import { computed, ref } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { MiniAppHost } from '@/composables/useMiniAppHost'
import { useToast } from '@/composables/useToast'
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
  console.log('ETH address:', data)
  return data
})

interface DApp {
  name: string
  url: string
  icon: string
}

const popularDApps: DApp[] = [
  {
    name: 'Uniswap',
    url: 'https://app.uniswap.org',
    icon: 'https://app.uniswap.org/favicon.png',
  },
  {
    name: 'Polymarket',
    url: 'https://polymarket.com',
    icon: 'https://polymarket.com/icons/favicon-32x32.png',
  },
  {
    name: 'DappRadar',
    url: 'https://dappradar.com',
    icon: 'https://static.dappradar.com/website-fe-pr/public-assets/favicon-32x32.png',
  },
  {
    name: 'Aave',
    url: 'https://app.aave.com',
    icon: 'https://app.aave.com/favicon.ico',
  },
  {
    name: 'OpenSea',
    url: 'https://opensea.io',
    icon: 'https://opensea.io/favicon.ico',
  },
  {
    name: '1inch',
    url: 'https://app.1inch.io',
    icon: 'https://1inch.com/favicon/favicon-96x96.png',
  },
]

// Request user confirmation for sensitive operations
async function requestUserConfirmation(request: UserConfirmationRequest): Promise<boolean> {
  switch (request.type) {
    case 'accounts': {
      const result = await ExtendedDialog.sheet({
        title: 'Permission Request',
        rows: [{ title: 'Permission', value: 'View account addresses' }],
        confirmButtonTitle: 'Allow',
        cancelButtonTitle: 'Deny',
      })
      return result.confirmed
    }

    case 'transaction': {
      const { recipient, amount, fee, message, merchantName } = request.data
      const amountNim = (amount / 1e5).toFixed(5)
      const feeNim = fee ? (fee / 1e5).toFixed(5) : '0'

      const rows: { title: string, value: string }[] = [
        { title: 'Recipient', value: recipient },
        { title: 'Amount', value: `${amountNim} NIM` },
      ]
      if (fee)
        rows.push({ title: 'Fee', value: `${feeNim} NIM` })
      if (message)
        rows.push({ title: 'Message', value: message })
      if (merchantName)
        rows.push({ title: 'Merchant', value: merchantName })

      const result = await ExtendedDialog.sheet({
        title: 'Confirm Transaction',
        rows,
      })
      return result.confirmed
    }

    case 'eth-transaction': {
      const txParams = request.data as {
        to: string
        from: string
        value?: string
        data?: string
        gas?: string
      }
      const valueEth = formatEther(BigInt(txParams.value || '0x0'))
      const gasLimit = txParams.gas ? Number.parseInt(txParams.gas, 16) : 0

      const rows: { title: string, value: string }[] = [
        { title: 'To', value: txParams.to },
        { title: 'From', value: txParams.from },
        { title: 'Value', value: `${valueEth} ETH` },
        { title: 'Gas Limit', value: String(gasLimit) },
      ]
      if (txParams.data && txParams.data !== '0x')
        rows.push({ title: 'Contract Interaction', value: 'Yes' })

      const result = await ExtendedDialog.sheet({
        title: 'Confirm ETH Transaction',
        rows,
      })
      return result.confirmed
    }

    case 'message': {
      const { message: msgToSign, isHex } = request.data
      const displayMessage = isHex
        ? `Hex data: ${msgToSign.slice(0, 50)}${msgToSign.length > 50 ? '...' : ''}`
        : msgToSign

      const result = await ExtendedDialog.sheet({
        title: 'Sign Message',
        rows: [{ title: 'Message', value: displayMessage }],
        confirmButtonTitle: 'Sign',
        cancelButtonTitle: 'Reject',
      })
      return result.confirmed
    }

    default:
      logger.error('Unknown confirmation request type:', request)
      return false
  }
}

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
  await InAppBrowser.openWebView({
    url: targetUrl,
    title: appTitle,
    toolbarType: ToolBarType.NAVIGATION,
    enabledSafeBottomMargin: true,
    useTopInset: true,
    activeNativeNavigationForWebview: true,
    isPresentAfterPageLoad: true,
    // TODO: Load file into variable with node:path at build time instead? Would avoid copying the file to /public.
    preShowScript: await fetch('/web3-provider.js').then(res => res.text()),
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
