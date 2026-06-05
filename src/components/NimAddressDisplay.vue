<script setup lang="ts">
import { Clipboard } from '@capacitor/clipboard'
import { IonButton, IonIcon } from '@ionic/vue'
import { Identicon } from '@nimiq/vue3-components'
import { qrCodeOutline } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted } from 'vue'
import AddressDisplay from '@/components/AddressDisplay.vue'
import PolygonWarning from '@/components/PolygonWarning.vue'
import TestnetFaucet from '@/components/TestnetFaucet.vue'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { isTestnet } from '@/lib'
import { stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'

defineProps({ address: { type: String } })

defineEmits(stepEmits)

const { setToast } = useToast()
const { consensus } = storeToRefs(useNimiqNetwork())
const { isConsensusNeeded } = storeToRefs(useLocks())
const { isNimiqAsset } = storeToRefs(useApp())

const address = computed(() => {
  if (!isNimiqAsset.value)
    return useLocalWallet().getEthAddress().data || ''
  return useLocalWallet().localAddress.toUserFriendlyAddress()
})

async function handleCopy() {
  await Clipboard.write({
    string: address.value,
  })
  await setToast({ message: i18n.t('Address copied to clipboard') })
}

onUnmounted(() => {
  if (isNimiqAsset.value && consensus.value !== 'established')
    isConsensusNeeded.value = true
})
</script>

<template>
  <div class="flex flex-col self-start w-full h-full pb-2 relative">
    <div class="flex flex-col items-center justify-center gap-y-8 h-full">
      <Identicon v-if="isNimiqAsset" :address="address" class="size-20 tall:size-32" />
      <AddressDisplay :class="isNimiqAsset ? 'max-w-64' : 'max-w-min !px-5'" :address="address" :format="isNimiqAsset ? 'nimiq' : 'ethereum'" />
    </div>
    <PolygonWarning
      v-if="!isNimiqAsset"
      class="mt-auto mb-6"
      :message="$t('Make sure you are sending from a Polygon address, or your funds might be permanently lost!')"
      :tooltip-message="$t('The Pay app uses USDT on the Polygon network. Sending funds from a non-Polygon address could result in permanent loss.')"
    />
    <div class="w-full mt-auto mb-4 flex flex-col items-center gap-4">
      <TestnetFaucet v-if="isTestnet && isNimiqAsset" :address="address" />
      <IonButton
        aria-label="Copy address"
        size="small"
        fill="clear"
        class="text-base font-bold normal-case custom-button"
        style="--background: #1F23480D;"
        @click="handleCopy"
      >
        {{ $t('Copy address') }}
      </IonButton>
      <IonButton
        v-if="isNimiqAsset"
        size="small"
        fill="clear"
        class="text-base font-bold normal-case custom-button"
        @click="$emit('done')"
      >
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

<style scoped>
.custom-button {
  --padding-top: 4px;
  --padding-bottom: 4px;
  --padding-start: 18px;
  --padding-end: 18px
}
</style>
