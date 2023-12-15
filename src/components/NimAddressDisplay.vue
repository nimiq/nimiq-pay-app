<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue'
import { Clipboard } from '@capacitor/clipboard'
import { qrCodeOutline } from 'ionicons/icons'
import { Browser } from '@capacitor/browser'
import { stepEmits } from '@/lib/flows/steps.types'
import { useLocalWallet } from '@/stores/local-wallet'
import AddressDisplay from '@/components/AddressDisplay.vue'
import NimLogo from '@/components/icons/nimiq-logo.vue'
import { walletUrl } from '@/lib/index'
import { useToast } from '@/composables/useToast'

defineProps({ address: { type: String } })

defineEmits(stepEmits)

const { setToast } = useToast()

const address = useLocalWallet().localAddress.toUserFriendlyAddress()

async function openWallet() {
  const url = new URL(`${walletUrl}/nimiq:${useLocalWallet().localAddress.toHex()}`)

  await Browser.open({ url: url.toString(), toolbarColor: '#E9B213' })
  Browser.addListener('browserFinished', () => {
    // TODO: check if tx incoming
    Browser.removeAllListeners()
  })
}

async function handleCopy() {
  await Clipboard.write({
    string: address,
  })
  await setToast({message: 'Address copied to clipboard'})
}
</script>

<template>
  <div class="flex flex-col self-start w-full h-full pt-8 pb-2">
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
      <IonButton expand="block" fill="clear" class="text-base font-semibold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="handleCopy">
        Copy address
      </IonButton>
    </div>
  </div>
</template>
