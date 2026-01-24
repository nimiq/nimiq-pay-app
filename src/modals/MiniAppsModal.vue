<script setup lang="ts">
import { ref } from 'vue'
import { IonInput } from '@ionic/vue'
import { InAppBrowser, ToolBarType } from '@capgo/inappbrowser'
import { ExtendedDialog } from 'capacitor-extended-dialog'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { MiniAppHost, UserConfirmationRequest } from '@/composables/useMiniAppHost'
import { useToast } from '@/composables/useToast'

const logger = useLogger('MiniAppModal')

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
    icon: 'https://dappradar.com/favicon.ico',
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
    icon: 'https://app.1inch.io/favicon.ico',
  },
]

// Request user confirmation for sensitive operations
async function requestUserConfirmation(request: UserConfirmationRequest): Promise<boolean> {
  const appName = request.name || request.url;

  switch (request.type) {
    case 'accounts': {
      // Use multiSelect for permission request
      const result = await ExtendedDialog.multiSelect({
        title: 'Permission Request',
        message: `${appName} wants to access your accounts`,
        options: [
          { label: 'View account addresses', value: 'view_addresses' },
        ],
        selectedValues: ['view_addresses'],
      });
      // User confirmed if they didn't cancel and selected the option
      return !result.cancelled && result.values.includes('view_addresses');
    }

    case 'transaction': {
      // Use confirm for transaction confirmation
      const { recipient, amount, fee, message, merchantName } = request.data;
      const amountNim = (amount / 1e5).toFixed(5);
      const feeNim = fee ? (fee / 1e5).toFixed(5) : '0';

      let confirmMessage = `${appName} wants to send a transaction:`;
      confirmMessage += `\n\nRecipient: ${recipient}`;
      confirmMessage += `\nAmount: ${amountNim} NIM`;
      if (fee) confirmMessage += `\nFee: ${feeNim} NIM`;
      if (message) confirmMessage += `\nMessage: ${message}`;
      if (merchantName) confirmMessage += `\nMerchant: ${merchantName}`;

      const result = await ExtendedDialog.confirm({
        title: 'Confirm Transaction',
        message: confirmMessage,
      });
      return result.value;
    }

    case 'message': {
      // Use confirm for message signing confirmation
      const { message: msgToSign, isHex } = request.data;
      const displayMessage = isHex
        ? `Hex data: ${msgToSign.slice(0, 50)}${msgToSign.length > 50 ? '...' : ''}`
        : msgToSign;

      const result = await ExtendedDialog.confirm({
        title: 'Sign Message',
        message: `${appName} wants to sign a message:\n\n${displayMessage}`,
      });
      return result.value;
    }

    default:
      logger.error('Unknown confirmation request type:', request);
      return false;
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
  });

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
            placeholder="Enter URL"
            clear-input
            v-model="miniAppUrl"
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
