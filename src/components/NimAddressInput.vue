<script setup lang="ts">
import type { PropType } from 'vue'
import type { State } from '@/lib/flows/steps.types'
import { IonButton } from '@ionic/vue'
import { getAddress } from 'ethers'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import AddressInput from '@/components/AddressInput.vue'
import QRIcon from '@/components/icons/qr.vue'
import PolygonWarning from '@/components/PolygonWarning.vue'
import { addressesEqual, isValidEthAddress } from '@/lib/ethereum'
import { stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useLocalWallet } from '@/stores/local-wallet'
import { useRemoteSigner } from '@/stores/remote-signer'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
const emit = defineEmits(stepEmits)

const { isNimiqAsset } = storeToRefs(useApp())
const address = ref<string>()
watch(() => props.state.qrCodeScanner, (value) => {
  if (typeof value === 'string')
    address.value = value || ''
  else if (value && typeof value === 'object' && 'recipient' in value)
    address.value = value.recipient
  else
    address.value = ''
}, { immediate: true })

const { remoteAddress } = storeToRefs(useRemoteSigner())
const { localAddress } = storeToRefs(useLocalWallet())
const localEthAddress = computed(() => useLocalWallet().getEthAddress().data || '')

const validAddress = computed(() => {
  if (!address.value)
    return false

  if (isNimiqAsset.value)
    return remoteAddress.value?.toUserFriendlyAddress() !== address.value && localAddress.value.toUserFriendlyAddress() !== address.value

  if (!isValidEthAddress(address.value))
    return false
  if (!isValidEthAddress(localEthAddress.value))
    return true
  return !addressesEqual(address.value, localEthAddress.value)
})

const hasError = computed(() => !validAddress.value && !!address.value)

function handleSave() {
  if (!address.value)
    return

  const normalizedAddress = isNimiqAsset.value ? address.value : getAddress(address.value)
  useApp().addNewWithdrawalAddress(normalizedAddress)
  emit('done', normalizedAddress)
}
</script>

<template>
  <div class="flex flex-col self-start w-full h-full py-8">
    <div class="m-auto">
      <p aria-label="Enter Address" class="mb-6 text-sm font-bold text-center uppercase text-space/60">
        {{ $t('Enter Address') }}
      </p>
      <AddressInput
        v-if="isNimiqAsset"
        :address="props.state.qrCodeScanner as string"
        @update:address="(v: string) => address = v"
      />
      <input
        v-else
        :value="address"
        autocapitalize="off"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        class="w-full px-4 py-3 font-mono text-base rounded border-[1.5px] border-space-space-400 focus:outline-none focus:border-sky/40"
        :placeholder="$t('0x...')"
        aria-label="Address input"
        @input="address = ($event.target as HTMLInputElement).value.trim()"
      >
      <QRIcon class="mt-6 ml-auto w-9 h-9" @click="$emit('done')" />
      <PolygonWarning
        v-if="!isNimiqAsset"
        class="mt-6"
        :message="$t('Withdraw to Polygon USDT addresses only!')"
        :tooltip-message="$t('The USDT stablecoin was originally launched on Ethereum. To avoid high fees and enable fast transactions, the Pay app uses the Polygon version. Funds sent to non-Polygon USDT addresses could be permanently lost.')"
      />
    </div>

    <p v-if="hasError" class="mt-8 text-center text-tomato">
      <template v-if="!validAddress">
        {{ $t('You can not use this address') }}
      </template>
      <template v-else>
        {{ errorMsg }}
      </template>
    </p>
  </div>
  <IonButton aria-label="Save" :disabled="!address || !validAddress" class="w-full mt-auto text-base font-bold mb-[max(env(safe-area-inset-bottom),1rem)]" @click="handleSave">
    {{ $t('Save') }}
  </IonButton>
</template>
