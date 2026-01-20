<script setup lang="ts">
import { ref } from 'vue'
import { IonInput } from '@ionic/vue'
import { InAppBrowser, ToolBarType } from '@capgo/inappbrowser'
import { ExtendedDialog } from 'capacitor-extended-dialog'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { MiniAppHost, UserConfirmationRequest } from '@/composables/useMiniAppHost'

const logger = useLogger('MiniAppModal')

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

async function openMiniApp() {
  // Create the mini app host with configuration
  const host = new MiniAppHost(InAppBrowser, {
    url: miniAppUrl.value,
    title: 'Mini App', // TODO: Use app name of the mini-app if available
    requestUserConfirmation,
  });

  // TODO: Webview opening and lifecycle handling could be moved into the MiniAppHost class constructor
  const miniAppWebView = await InAppBrowser.openWebView({
    url: miniAppUrl.value,
    title: 'Mini App', // TODO: Use app name of the mini-app if available
    toolbarType: ToolBarType.NAVIGATION,
    enabledSafeBottomMargin: true,
    useTopInset: true,
    activeNativeNavigationForWebview: true,
    isPresentAfterPageLoad: true,
    // TODO: Load file into variable with node:path at build time instead? Would avoid copying the file to /public.
    preShowScript: await fetch('/web3-provider.js').then(res => res.text()),
    preShowScriptInjectionTime: 'documentStart',
  }).catch((err) => {
    logger.error('Failed to open mini-app:', err);
    alert('Could not open the mini-app webview');
  });
  if (!miniAppWebView) return;

  InAppBrowser.addListener('closeEvent', () => {
    logger.log('Mini-app webview closed, destroying host');
    host.destroy();
  });
}
</script>

<template>
  <ModalTemplate :close-all="true">
    <div class="w-full h-full flex flex-col">
      <p class="text-space/60 text-sm font-bold text-left uppercase">
        Mini Apps
      </p>

      <form class="m-4 flex flex-col gap-4" @submit.prevent="openMiniApp">
        <label class="text-sm font-medium text-gray-700">
          Mini App URL
        </label>
        <IonInput
          placeholder="Enter URL"
          clear-input
          v-model="miniAppUrl"
        />
        <button
          type="submit"
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
          :disabled="!miniAppUrl"
        >
          Open Mini App
        </button>
      </form>
    </div>
  </ModalTemplate>
</template>

<style scoped>
</style>
