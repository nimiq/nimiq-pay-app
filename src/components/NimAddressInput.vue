<script setup lang="ts">
import type { PropType } from 'vue'
import type { State } from '@/lib/flows/steps.types'
import { IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed, ref, toRefs, watch } from 'vue'
import AddressInput from '@/components/AddressInput.vue'
import QRIcon from '@/components/icons/qr.vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useLocalWallet } from '@/stores/local-wallet'
import { useRemoteSigner } from '@/stores/remote-signer'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
const emit = defineEmits(stepEmits)

const { withdrawalAddress, withdrawalAddressesHistory } = storeToRefs(useApp())
const address = ref<string>()
watch(() => toRefs(props.state), ({ qrCodeScanner }) => address.value = qrCodeScanner.value as string || '', { deep: true })

const { remoteAddress } = storeToRefs(useRemoteSigner())
const { localAddress } = storeToRefs(useLocalWallet())

const validAddress = computed(() => {
  return remoteAddress.value?.toUserFriendlyAddress() !== address.value && localAddress.value.toUserFriendlyAddress() !== address.value
})

const hasError = computed(() => !validAddress.value && !!address.value)

function handleSave() {
  if (!address.value)
    return
  withdrawalAddress.value = address.value
  withdrawalAddressesHistory.value.push(address.value)
  emit('done', address.value)
}
</script>

<template>
  <div class="flex flex-col self-start w-full h-full py-8">
    <div class="m-auto">
      <p class="mb-6 text-sm font-bold text-center uppercase text-space/60">
        {{ $t('Enter Address') }}
      </p>
      <AddressInput :address="props.state.qrCodeScanner as string" @update:address="(v: string) => address = v" />
      <QRIcon class="mt-6 ml-auto w-9 h-9" @click="$emit('done')" />
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
  <IonButton :disabled="!address || !validAddress" class="w-full mt-auto text-base font-bold mb-[max(env(safe-area-inset-bottom),1rem)]" @click="handleSave">
    {{ $t('Save') }}
  </IonButton>
</template>
