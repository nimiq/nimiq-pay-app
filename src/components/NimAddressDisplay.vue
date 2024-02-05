<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue'
import { Clipboard } from '@capacitor/clipboard'
import { qrCodeOutline } from 'ionicons/icons'
import { Browser } from '@capacitor/browser'
import { Identicon } from '@nimiq/vue3-components'
import { stepEmits } from '@/lib/flows/steps.types'
import { useLocalWallet } from '@/stores/local-wallet'
import { walletUrl } from '@/lib/index'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import AddressDisplay from '@/components/AddressDisplay.vue'

defineProps({ address: { type: String } })

defineEmits(stepEmits)

const { setToast } = useToast()

const address = useLocalWallet().localAddress.toUserFriendlyAddress()

async function openWallet() {
  const url = new URL(`/nimiq:${useLocalWallet().localAddress.toUserFriendlyAddress()}`, walletUrl)

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
  await setToast({ message: i18n.t('Address copied to clipboard') })
}
</script>

<template>
  <div class="flex flex-col self-start w-full h-full pt-8 tall:pb-2">
    <div class="flex flex-col items-center justify-center gap-y-2 small:mt-4 small:gap-y-3 tall:mt-8 tall:gap-y-4">
      <Identicon :address="address" class="w-20" />
      <AddressDisplay class="w-4/5 min-w-[18rem]" :address="address" />
      <!-- Scan Cashlink Button -->
      <div>
        <IonButton expand="block" fill="clear" class="text-base font-semibold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="$emit('done')">
          <IonIcon slot="start" :icon="qrCodeOutline" />
          {{ $t('Scan Cashlink') }}
        </IonButton>
      </div>
    </div>
    <div class="w-full mt-auto">
      <IonButton expand="block" class="text-base" @click="openWallet">
        {{ $t('Open Wallet') }}
      </IonButton>
      <IonButton expand="block" fill="clear" class="text-base font-semibold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="handleCopy">
        {{ $t('Copy address') }}
      </IonButton>
    </div>
  </div>
</template>
