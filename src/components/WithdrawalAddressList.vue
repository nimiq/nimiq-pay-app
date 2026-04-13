<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import RemoveIcon from '@/components/icons/remove.vue'
import ShortAddressDisplay from '@/components/ShortAddressDisplay.vue'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'

const emit = defineEmits(stepEmits)
const { withdrawalAddressesHistory, topUpAddresses, isNimiqAsset } = storeToRefs(useApp())
const addresses = computed(() => {
  const all = [...new Set([...topUpAddresses.value, ...withdrawalAddressesHistory.value.slice().reverse()])]
  return all.filter(addr => isNimiqAsset.value ? addr.startsWith('NQ') : addr.startsWith('0x'))
})

function handleSelectAddress(address: string) {
  emit('done', address)
}

function handleRemoveAddress(address: string) {
  initializeFlow(FlowName.AddressDeletion, { initialState: { confirmAddressDeletion: address }, isOnTop: true, height: 'h-max' })
}

function handleAddAddress() {
  emit('done', '')
}
</script>

<template>
  <div class="flex flex-col items-center gap-y-8 py-8">
    <div v-if="addresses.length > 0" class="flex flex-col gap-y-2 max-h-96 overflow-y-auto w-full">
      <div v-for="address in addresses" :key="address" class="flex items-center">
        <ShortAddressDisplay :address="address" class="text-lg py-3 w-full" @click="() => handleSelectAddress(address)" />
        <button class="p-4" aria-label="Delete address" @click="() => handleRemoveAddress(address)">
          <RemoveIcon class="size-5 text-space-space-800" />
        </button>
      </div>
    </div>
    <p v-else aria-label="No saved addresses" class="text-center text-lg text-space/60">
      {{ $t('No saved addresses') }}
    </p>
    <IonButton aria-label="Add another address" size="small" fill="clear" class="text-base font-bold normal-case w-max" style="--background: #1F23480D; --padding-top: 4px; --padding-bottom: 4px; --padding-start: 18px; --padding-end: 18px; --ripple-color: #1F234805" @click="handleAddAddress">
      {{ $t('Add another address') }}
    </IonButton>
  </div>
</template>
