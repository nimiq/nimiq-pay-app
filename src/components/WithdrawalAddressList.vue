<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue'
import { Identicon } from '@nimiq/vue3-components'
import { useFuse } from '@vueuse/integrations/useFuse'
import { search } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import PenIcon from '@/components/icons/pen.vue'
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
  <div class="flex flex-col w-full h-full pb-6">
    <div>
      <div class="flex items-center justify-between">
        <p class="text-sm font-bold text-center uppercase text-space/60">
          {{ $t('Select Address') }}
        </p>
        <IonButton fill="clear" size="small" class="text-sky">
          <PenIcon class="size-4 mr-1" />
          {{ $t('Edit') }}
        </IonButton>
      </div>
      <div class="relative transition-colors border-2 rounded-md border-neutral-neutral-200 focus-within:border-sky-sky-600">
        <IonIcon :icon="search" class="absolute top-2 left-4 text-space/60" />
        <input
          v-model="addressFilter"
          type="text"
          class="w-full h-8 px-4 pl-10 border-none focus:outline-none focus:ring-0"
          :placeholder="$t('Search for an address')"
        >
      </div>
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
    </div>
    <div class="w-full mt-auto">
      <IonButton class="w-full mt-6 text-base font-bold" @click="emit('done', '')">
        {{ $t('Add New Address') }}
      </IonButton>
    </div>
  </div>
</template>
