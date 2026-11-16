<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonSpinner, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { isTestnet } from '@/lib'
import { isMockEnabled } from '@/lib/mock-mode'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { usePolygonUsdt } from '@/stores/polygon-usdt'
import { useRemoteSigner } from '@/stores/remote-signer'

const logger = useLogger('LogOutModal/Confirm')

const { closeModal, showModal } = useModal()
const router = useRouter()
const { hasDoneBackup } = storeToRefs(useApp())
const { remoteBalance } = storeToRefs(useRemoteSigner())
const { localBalance } = storeToRefs(useLocalWallet())
const usdtStore = usePolygonUsdt()
const { balance: usdtBalance } = storeToRefs(usdtStore)
const { deleteDatabase } = useConn()

const isCheckingUsdt = ref(false)
let isUnmounted = false
onUnmounted(() => {
  isUnmounted = true
})

function isNimEmpty() {
  return remoteBalance.value === 0 && localBalance.value === 0
}

async function handleConfirm() {
  let isEmpty = false
  if (!hasDoneBackup.value && isNimEmpty()) {
    let isUsdtEmpty = usdtBalance.value === 0
    // USDT only exists on mainnet; mock mode seeds `balance` itself and has no RPC client.
    if (!isTestnet && !isMockEnabled) {
      // `balance` is only refreshed while the USDT tab polls, so it can be a stale 0. Read it from the RPC now;
      // if that read fails the USDT balance is unknown, so warn instead of risking USDT funds.
      isCheckingUsdt.value = true
      try {
        isUsdtEmpty = await usdtStore.updateBalance() && usdtBalance.value === 0
      }
      finally {
        isCheckingUsdt.value = false
      }
      // The user can close the sheet while the RPC read is pending; never delete the wallet after that.
      if (isUnmounted)
        return
    }
    // NIM can arrive during the read, so check it again.
    isEmpty = isUsdtEmpty && isNimEmpty()
  }
  logger.log('handleConfirm', {
    hasDoneBackup: hasDoneBackup.value,
    localBalance: localBalance.value,
    remoteBalance: remoteBalance.value,
    usdtBalance: usdtBalance.value,
    isEmpty,
  })
  if (hasDoneBackup.value || isEmpty) {
    // TODO: ask for pin
    await deleteDatabase()
    router.replace('/setup')
  }
  else {
    showModal(Modal.LogoutWarning, { isOnTop: true, isSmall: true })
  }
}
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="() => closeModal()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <div class="flex flex-col items-center h-full p-8 pt-0 text-center">
    <h1 class="text-2xl font-bold text-balance">
      {{ $t('Are you sure you want to log out?') }}
    </h1>
    <p class="self-start mt-4 text-base text-center whitespace-pre-line text-space/60 text-balance">
      {{ $t('Log in again with your recovery words.\nPlease ensure that you have them available before logging out.') }}
    </p>

    <IonButton class="self-end w-11/12 mx-auto mt-32 text-base" :disabled="isCheckingUsdt" @click="handleConfirm">
      <IonSpinner v-if="isCheckingUsdt" name="crescent" />
      <template v-else>
        {{ $t('Confirm') }}
      </template>
    </IonButton>
  </div>
</template>
