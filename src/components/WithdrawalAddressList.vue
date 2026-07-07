<script setup lang="ts">
import type { SavedAddress } from '@/stores/app'
import { IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref } from 'vue'
import PenIcon from '@/components/icons/pen.vue'
import RemoveIcon from '@/components/icons/remove.vue'
import ShortAddressDisplay from '@/components/ShortAddressDisplay.vue'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'

const emit = defineEmits(stepEmits)
const app = useApp()
const { withdrawalAddressesHistory, isNimiqAsset } = storeToRefs(app)

// Most-recently-saved first, filtered to the active asset.
const addresses = computed<SavedAddress[]>(() =>
  withdrawalAddressesHistory.value
    .slice()
    .reverse()
    .filter(({ address }) => isNimiqAsset.value ? address.startsWith('NQ') : address.startsWith('0x')),
)

function handleSelectAddress(address: string) {
  emit('done', address)
}

function handleRemoveAddress(address: string) {
  initializeFlow(FlowName.AddressDeletion, { initialState: { confirmAddressDeletion: address }, isOnTop: true, height: 'h-max' })
}

function handleAddAddress() {
  emit('done', '')
}

const editingAddress = ref<string | null>(null)
const editingAlias = ref('')
const aliasInput = ref<HTMLInputElement | null>(null)

function startEditing(entry: SavedAddress) {
  editingAddress.value = entry.address
  editingAlias.value = entry.alias ?? ''
  nextTick(() => aliasInput.value?.focus())
}

function cancelEditing() {
  editingAddress.value = null
  editingAlias.value = ''
}

function saveAlias() {
  if (!editingAddress.value)
    return
  app.setAddressAlias(editingAddress.value, editingAlias.value)
  cancelEditing()
}
</script>

<template>
  <div class="flex flex-col items-center gap-y-8 py-8">
    <div v-if="addresses.length > 0" class="flex flex-col gap-y-2 max-h-96 overflow-y-auto w-full">
      <div v-for="entry in addresses" :key="entry.address" class="flex items-center">
        <template v-if="editingAddress === entry.address">
          <input
            ref="aliasInput"
            v-model="editingAlias"
            type="text"
            maxlength="32"
            :placeholder="$t('Alias (optional)')"
            aria-label="Edit address alias"
            class="flex-1 min-w-0 px-3 py-2 text-base rounded border-[1.5px] border-space-space-200 focus:outline-none focus:border-sky/40 truncate"
            @keydown.enter="saveAlias"
            @keydown.escape="cancelEditing"
          >
          <button class="px-3 py-2 text-sm font-bold text-sky" aria-label="Save alias" @click="saveAlias">
            {{ $t('Save') }}
          </button>
          <button class="px-3 py-2 text-sm font-bold text-space/60" aria-label="Cancel alias edit" @click="cancelEditing">
            {{ $t('Cancel') }}
          </button>
        </template>
        <template v-else>
          <ShortAddressDisplay
            :address="entry.address"
            :alias="entry.alias"
            class="text-lg py-3 flex-1 min-w-0 cursor-pointer"
            @click="() => handleSelectAddress(entry.address)"
          />
          <button class="p-2" aria-label="Edit alias" @click="() => startEditing(entry)">
            <PenIcon class="size-5 text-space-space-600" />
          </button>
          <button class="p-2" aria-label="Delete address" @click="() => handleRemoveAddress(entry.address)">
            <RemoveIcon class="size-5 text-space-space-600" />
          </button>
        </template>
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
