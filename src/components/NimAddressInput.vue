<script setup lang="ts">
import { type PropType, ref, toRefs, watch } from 'vue'
import { IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { type State, stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import AddressInput from '@/components/AddressInput.vue'
import QRIcon from '@/components/icons/qr.vue'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
const emit = defineEmits(stepEmits)

const { withdrawalAddress } = storeToRefs(useApp())
const address = ref<string>()
watch(() => toRefs(props.state), ({ qrCodeScanner }) => address.value = qrCodeScanner.value as string || '', { deep: true })

function handleSave() {
  if (!address.value)
    return
  withdrawalAddress.value = address.value
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
      <QRIcon class="mt-4 ml-auto w-9 h-9" @click="$emit('done')" />

      <!-- <button @click="$emit('done')">
      </button> -->
      <!-- TODO: Fun fact! Opening the camera, then close it and then open it again does not work. Alberto, add it to the list 🦈 -->
    </div>

    <p class="mt-8 text-center text-tomato">
      {{ errorMsg }}
    </p>
    <IonButton :disabled="!address" size="small" class="w-full mt-auto text-base font-bold" @click="handleSave">
      {{ $t('Save') }}
    </IonButton>
  </div>
</template>
