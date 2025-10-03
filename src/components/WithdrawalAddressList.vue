<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { Identicon } from '@nimiq/vue3-components'
import { useFuse } from '@vueuse/integrations/useFuse'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'

const emit = defineEmits(stepEmits)
const { withdrawalAddress, withdrawalAddressesHistory } = storeToRefs(useApp())
const addressFilter = shallowRef('')
const addresses = computed(() => withdrawalAddressesHistory.value.slice().reverse())
const { results: addressList } = useFuse(addressFilter, addresses, { fuseOptions: { ignoreLocation: true, isCaseSensitive: false }, matchAllWhenSearchEmpty: true })

function handleSelectAddress(address: string) {
  withdrawalAddress.value = address
  emit('done', address)
}
</script>

<template>
  <div class="flex flex-col gap-4 mt-4">
    <div v-for="{ item: address } in addressList" :key="address" class="p-4 flex gap-4 items-center bg-neutral-100 rounded-lg" @click="() => handleSelectAddress(address)">
      <Identicon :address="address" class="w-20" />
      <p class="text-base font-mono font-semibold">
        {{ address }}
      </p>
    </div>
  </div>
  <p v-if="!withdrawalAddressesHistory.length" class="text-center text-space/60">
    {{ $t('No saved addresses') }}
  </p>
  <div class="w-full mt-auto">
    <IonButton class="w-full mt-6 text-base font-bold" @click="emit('done', '')">
      {{ $t('Add New Address') }}
    </IonButton>
  </div>
</template>
