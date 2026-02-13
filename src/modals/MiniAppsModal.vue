<script setup lang="ts">
import type { UserConfirmationRequest } from '@/composables/useMiniAppHost'
import { InAppBrowser, ToolBarType } from '@capgo/inappbrowser'
import { IonInput } from '@ionic/vue'
import { computedAsync } from '@vueuse/core'
import { ExtendedDialog } from 'capacitor-extended-dialog'
import { formatEther } from 'ethers'
import { computed, ref } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { MiniAppHost } from '@/composables/useMiniAppHost'
import { useToast } from '@/composables/useToast'
import { getFaviconUrl } from '@/lib/favicon'
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

function getAppIcon(url: string): string {
  try {
    const hostname = new URL(url).hostname
    const known = popularDApps.find((d) => {
      const dappHost = new URL(d.url).hostname
      return hostname === dappHost || hostname.endsWith(`.${dappHost}`)
    })
    return known?.icon || getFaviconUrl(url)
  }
  catch {
    return getFaviconUrl(url)
  }
}

// Request user confirmation for sensitive operations
async function requestUserConfirmation(request: UserConfirmationRequest): Promise<boolean> {
  switch (request.type) {
    case 'accounts': {
      const appName = request.name || new URL(request.url).hostname
      const truncatedAddress = ethAddress.value
        ? `${ethAddress.value.slice(0, 6)}\u2026${ethAddress.value.slice(-4)}`
        : ''

      const result = await ExtendedDialog.sheet({
        title: `Connect to ${appName}`,
        subtitle: `${appName} will be able to:`,
        headerLogo: getAppIcon(request.url),
        headerLogoCornerRadius: -1,
        rows: [
          { title: `See your address ${truncatedAddress}` },
          { title: 'View your balance and activity' },
          { title: 'Request approval for transactions' },
        ],
        confirmButtonTitle: 'Connect',
        cancelButtonTitle: 'Cancel',
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
        maxFeePerGas?: string
        maxPriorityFeePerGas?: string
        gasPrice?: string
        nonce?: number
        chainId?: string
      }
      const appName = request.name || new URL(request.url).hostname
      const valueEth = formatEther(BigInt(txParams.value || '0x0'))
      const gasLimit = txParams.gas ? Number.parseInt(txParams.gas, 16) : 0

      // Convert wei hex to Gwei for readable gas prices
      const toGwei = (hex?: string) => {
        if (!hex)
          return null
        const wei = BigInt(hex)
        // 1 Gwei = 1e9 wei. Show up to 2 decimals.
        const gwei = Number(wei) / 1e9
        return `${gwei.toFixed(2)} Gwei`
      }

      // Estimate max total fee: gasLimit * maxFeePerGas (or gasPrice)
      const feePerGasHex = txParams.maxFeePerGas || txParams.gasPrice
      const maxTotalFee = feePerGasHex && gasLimit
        ? formatEther(BigInt(feePerGasHex) * BigInt(gasLimit))
        : null

      const rows: { title: string, value: string }[] = [
        { title: 'To', value: txParams.to },
        { title: 'Value', value: `${valueEth} ETH` },
        { title: 'Gas Limit', value: String(gasLimit) },
      ]

      if (txParams.maxFeePerGas) {
        const gwei = toGwei(txParams.maxFeePerGas)
        if (gwei)
          rows.push({ title: 'Max Fee', value: gwei })
      }
      if (txParams.maxPriorityFeePerGas) {
        const gwei = toGwei(txParams.maxPriorityFeePerGas)
        if (gwei)
          rows.push({ title: 'Priority Fee', value: gwei })
      }
      if (txParams.gasPrice && !txParams.maxFeePerGas) {
        const gwei = toGwei(txParams.gasPrice)
        if (gwei)
          rows.push({ title: 'Gas Price', value: gwei })
      }
      if (maxTotalFee)
        rows.push({ title: 'Max Total Fee', value: `${maxTotalFee} ETH` })
      if (txParams.nonce !== undefined)
        rows.push({ title: 'Nonce', value: String(txParams.nonce) })
      if (txParams.data && txParams.data !== '0x')
        rows.push({ title: 'Contract Interaction', value: 'Yes' })

      const result = await ExtendedDialog.sheet({
        title: `Confirm ETH Transaction`,
        headerLogo: getAppIcon(request.url),
        headerLogoCornerRadius: -1,
        rows,
        confirmButtonTitle: 'Confirm',
        cancelButtonTitle: 'Reject',
      })
      return result.confirmed
    }

    case 'message': {
      const appName = request.name || new URL(request.url).hostname
      const { message: msgToSign, isHex } = request.data
      const displayMessage = isHex
        ? `Hex data: ${msgToSign.slice(0, 50)}${msgToSign.length > 50 ? '...' : ''}`
        : msgToSign

      const result = await ExtendedDialog.messageSheet({
        title: `Sign message from ${appName}`,
        headerLogo: getAppIcon(request.url),
        headerLogoCornerRadius: -1,
        message: displayMessage,
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
