<script setup lang="ts">
import { IonButton, IonIcon, toastController } from '@ionic/vue'
import { useClipboard } from '@vueuse/core'
import { qrCodeOutline } from 'ionicons/icons'
import { Browser } from '@capacitor/browser'
import { watch } from 'vue'
import { stepEmits } from '@/types/steps'
import { useLocalWallet } from '@/stores/local-wallet'
import AddressDisplay from '@/components/AddressDisplay.vue'
import NimLogo from '@/components/icons/nimiq-logo.vue'
import { walletUrl } from '@/lib/index'
import { check } from '@/components/icons'

defineProps({ address: { type: String } })
defineEmits(stepEmits)

const address = useLocalWallet().localAddress.toUserFriendlyAddress()

const { copy, copied, isSupported: canCopy } = useClipboard({ source: address })

// TODO Move all of this logic to its own composable?
watch(copied, async () => {
  if (!copied.value)
    return
  const toast = await toastController.create({
    message: 'Address copied to clipboard',
    duration: 3 * 1e3,
    icon: check,
    cssClass: `notification-alert-toast`,
    position: 'bottom',
  })
  await toast.present()
})

async function openWallet() {
  const url = new URL(`${walletUrl}/nimiq:${useLocalWallet().localAddress.toHex()}`)

  // TODO: Do we really want to open our own browser? Most likely user have an account already in their browser
  await Browser.open({ url: url.toString(), toolbarColor: '#E9B213' })
  Browser.addListener('browserFinished', () => {
    // TODO: check if tx incoming
    Browser.removeAllListeners()
  })
}
</script>

<template>
  <div class="flex flex-col self-start w-full h-full pt-8">
    <div class="flex flex-col items-center justify-center mt-8">
      <NimLogo class="w-16 mb-8 h-14" />
      <AddressDisplay class="w-4/5 min-w-[18rem] my-4" :address="address" />
    </div>
    <div>
      <IonButton expand="block" fill="clear" class="text-base font-semibold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="$emit('done')">
        <IonIcon slot="start" :icon="qrCodeOutline" />
        Scan Cashlink
      </IonButton>
    </div>
    <div class="w-full mt-auto">
      <IonButton expand="block" class="text-base" @click="openWallet">
        Open Wallet
      </IonButton>
      <IonButton v-if="canCopy" expand="block" fill="clear" class="text-base font-semibold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="copy">
        Copy address
      </IonButton>
    </div>
  </div>
</template>
