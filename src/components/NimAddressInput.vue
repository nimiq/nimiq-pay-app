<script setup lang="ts">
import type { PropType } from 'vue'
import { ref, toRefs, watch } from 'vue'
import { IonButton } from '@ionic/vue'
import type { State } from '@/types/steps'
import { stepEmits } from '@/types/steps'
import AddressInput from '@/components/AddressInput.vue'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
defineEmits(stepEmits)

const address = ref<string>()
watch(() => toRefs(props.state), ({ qrCodeScanner }) => address.value = qrCodeScanner.value as string || '', { deep: true })
</script>

<template>
  <div class="flex flex-col self-start w-full h-full py-8">
    <div class="w-full mx-auto">
      <AddressInput :address="address" @update:address="(v: string) => address = v" />

      <p v-if="errorMsg" class="text-center text-tomato">
        {{ errorMsg }}
      </p>
      <button @click="$emit('done')">
        Scan QR code
      </button>

      <p class="mt-10 text-lg">
        {{ address }}
      </p>
      <!-- TODO: Fun fact! Opening the camera, then close it and then open it again does not work. Alberto, add it to the list 🦈 -->
    </div>

    <IonButton :disabled="!address" size="small" class="w-full mt-auto text-base font-bold" @click="$emit('done', address)">
      Save
    </IonButton>
  </div>
</template>
