<script setup lang="ts">
import type { PropType } from 'vue'
import type { State } from '@/lib/flows/steps.types'
import { IonButton } from '@ionic/vue'
import { computed } from 'vue'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import ShortAddressDisplay from './ShortAddressDisplay.vue'

const props = defineProps({
  state: { type: Object as PropType<State>, required: true },
})

const emit = defineEmits(stepEmits)

const app = useApp()
const addressToDelete = computed(() => props.state[StepName.ConfirmAddressDeletion])
const aliasToDelete = computed(() => app.getAlias(addressToDelete.value) ?? '')

function handleConfirmRemove() {
  app.removeSavedAddress(addressToDelete.value)
  emit('done')
}
</script>

<template>
  <div class="flex flex-col justify-center items-center gap-y-2">
    <i18n-t keypath="Delete {address}?" tag="p" class="flex items-baseline gap-x-2 text-2xl font-bold">
      <template #address>
        <ShortAddressDisplay :address="aliasToDelete ? undefined : addressToDelete" :alias="aliasToDelete" :hide-identicon="true" class="text-2xl" />
      </template>
    </i18n-t>
    <p class="font-normal text-base text-space/60">
      {{ $t('This action cannot be undone') }}
    </p>
    <IonButton aria-label="Delete Address" class="w-full uppercase font-bold text-base pb-8 pt-6" style="--background: var(--radial-gradient-red);" @click="handleConfirmRemove">
      {{ $t('Delete Address') }}
    </IonButton>
  </div>
</template>
