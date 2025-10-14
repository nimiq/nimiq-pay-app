<script setup lang="ts">
import { Clipboard } from '@capacitor/clipboard'
import { IonButton, IonIcon } from '@ionic/vue'
import { Identicon } from '@nimiq/vue3-components'
import { qrCodeOutline } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { onUnmounted } from 'vue'
import AddressDisplay from '@/components/AddressDisplay.vue'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { stepEmits } from '@/lib/flows/steps.types'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'

defineProps({ address: { type: String } })

defineEmits(stepEmits)

const { setToast } = useToast()
const { consensus } = storeToRefs(useNimiqNetwork())
const { isConsensusNeeded } = storeToRefs(useLocks())

const address = useLocalWallet().localAddress.toUserFriendlyAddress()

async function handleCopy() {
  await Clipboard.write({
    string: address,
  })
  await setToast({ message: i18n.t('Address copied to clipboard') })
}

onUnmounted(() => {
  if (consensus.value !== 'established')
    isConsensusNeeded.value = true
})
</script>

<template>
  <div class="flex flex-col self-start w-full h-full pt-8 tall:pb-2 relative">
    <div class="flex flex-col items-center justify-center gap-y-2 small:mt-4 small:gap-y-3 tall:mt-8 tall:gap-y-4">
      <Identicon :address="address" class="w-20" />
      <AddressDisplay class="w-4/5 min-w-[18rem]" :address="address" />
    </div>
    <div class="w-full mt-auto flex flex-col items-center justify-center">
      <IonButton size="small" fill="clear" class="text-base font-bold normal-case" style="--background: #1F23480D; --padding-top: 4px; --padding-bottom: 4px; --padding-start: 18px; --padding-end: 18px" @click="handleCopy">
        {{ $t('Copy address') }}
      </IonButton>
      <IonButton expand="block" fill="clear" class="text-base font-bold normal-case" @click="$emit('done')">
        {{ $t('Scan Cashlink') }}
      </IonButton>
    </div>
    <div class="absolute right-0 bottom-0">
      <IonButton fill="clear" @click="$emit('done', address)">
        <IonIcon :icon="qrCodeOutline" class="text-space/40 size-10" />
      </IonButton>
    </div>
  </div>
</template>
