<script setup lang="ts">
import { InAppBrowser, ToolBarType } from '@capgo/inappbrowser';
import { useBroadcastChannel } from '@vueuse/core';
import { IonInput } from '@ionic/vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { useModal } from '@/composables/useModal'
import { ref, watch } from 'vue'
import { MiniAppHost, UserConfirmationRequest } from '@/composables/useMiniAppHost';
import { PaymentRequestData } from '@/lib/flows/steps.types';

const logger = useLogger('MiniAppModal')

export interface AlertModalReadyMessage {
  type: 'modal-ready';
}

export interface AlertModalConfirmationMessage {
  type: 'modal-response';
  action: 'confirm' | 'cancel';
}

export type AlertModalResponseMessage =  AlertModalReadyMessage | AlertModalConfirmationMessage;
export interface AlertModalPostMessage {
  type: 'modal-data';
  modalData: {
    type: 'confirm-transaction';
    data: Omit<PaymentRequestData, "transfer">;
  }
}

const { post: broadcast, data: broadcastMessage, error } = useBroadcastChannel<AlertModalResponseMessage, AlertModalPostMessage>({ name: 'alert-modal-channel' })
watch(error, (err) => {
  if (err) {
    console.error('Broadcast channel error:', err);
  }
}, { immediate: true });

// Request user confirmation for sensitive operations
async function requestUserConfirmation(request: UserConfirmationRequest): Promise<boolean> {
  return new Promise((resolve) => {
    const unwatch = watch(broadcastMessage, (newMessage) => {
      console.log('[requestUserConfirmation] Received message from alert modal:', newMessage);

      if (newMessage.type === 'modal-ready') {
        switch (request.type) {
          case 'transaction':
            broadcast({
              type: 'modal-data',
              modalData: {
                type: 'confirm-transaction',
                data: request.data,
              }
            });
            break;
        }
      }

      if (newMessage.type === 'modal-response') {
        unwatch();
        resolve(newMessage.action === 'confirm');
      }
    });

    // Open the modal
    InAppBrowser.openWebView({
      url: `${window.location.origin}/alert`,
      toolbarType: ToolBarType.BLANK,
    }).catch((err) => {
      logger.error('Failed to open alert modal:', err);
      alert('Could not open the alert modal webview');
      unwatch();
      resolve(false);
    });
  });
}

const { showModal, closeModal } = useModal()

const miniAppUrl = ref(`http://${__VITE_SERVER_IP__}:5174`)

async function openMiniApp() {
  // Create the mini app host with configuration
  new MiniAppHost(InAppBrowser, {
    url: miniAppUrl.value,
    requestUserConfirmation,
  });

  await InAppBrowser.openWebView({
    url: miniAppUrl.value,
    title: 'Mini App',
    toolbarType: ToolBarType.NAVIGATION,
    enabledSafeBottomMargin: true,
    useTopInset: true,
    activeNativeNavigationForWebview: true,
  });
}
</script>

<template>
  <ModalTemplate :close-all="true">
    <div class="w-full h-full flex flex-col">
      <p class="text-space/60 text-sm font-bold text-left uppercase">
        {{ $t('Mini Apps') }}
      </p>

      <form class="m-4 flex flex-col gap-4" @submit.prevent="openMiniApp">
        <label class="text-sm font-medium text-gray-700">
          {{ $t('Mini App URL') }}
        </label>
        <IonInput
          placeholder="Enter URL"
          clearInput
          v-model="miniAppUrl"
        ></IonInput>
        <button
          type="submit"
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
          :disabled="!miniAppUrl"
        >
          {{ $t('Open Mini App') }}
        </button>
      </form>
    </div>
  </ModalTemplate>
</template>

<style scoped>
</style>
