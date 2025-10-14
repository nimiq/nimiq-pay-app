<script setup lang="ts">
import type { PropType } from 'vue'
import type { State } from '@/lib/flows/steps.types'
import { IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import ShortAddressDisplay from './ShortAddressDisplay.vue'

const props = defineProps({
  state: { type: Object as PropType<State>, required: true },
})

const emit = defineEmits(stepEmits)

const { withdrawalAddressesHistory, topUpAddresses, withdrawalAddress } = storeToRefs(useApp())
const addressToDelete = computed(() => props.state[StepName.ConfirmAddressDeletion])

function handleConfirmRemove() {
  const withdrawalIndex = withdrawalAddressesHistory.value.indexOf(addressToDelete.value)
  if (withdrawalIndex !== -1)
    withdrawalAddressesHistory.value.splice(withdrawalIndex, 1)

  const topUpIndex = topUpAddresses.value.indexOf(addressToDelete.value)
  if (topUpIndex !== -1)
    topUpAddresses.value.splice(topUpIndex, 1)

  if (withdrawalAddress.value === addressToDelete.value)
    withdrawalAddress.value = ''

  emit('done')
}
</script>

<template>
  <div class="flex flex-col justify-center items-center gap-y-2">
    <i18n-t keypath="Delete {address}?" tag="p" class="flex items-baseline gap-x-2 text-2xl font-bold">
      <template #address>
        <ShortAddressDisplay :address="addressToDelete" :hide-identicon="true" class="text-2xl" />
      </template>
    </i18n-t>
    <p class="font-normal text-base text-space/60">
      {{ $t('This action cannot be undone') }}
    </p>
    <IonButton class="w-full uppercase font-bold text-base pb-8 pt-6" style="--background: var(--radial-gradient-red);" @click="handleConfirmRemove">
      {{ $t('Delete Address') }}
    </IonButton>
  </div>
</template>
