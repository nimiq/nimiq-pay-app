<script setup lang="ts">
import type { PropType } from 'vue'
import { ref, watch } from 'vue'
import { IonButton } from '@ionic/vue'
import type { State } from '@/types/steps'
import { stepEmits } from '@/types/steps'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
defineEmits(stepEmits)

const address = ref<string>()
watch(() => props.state, ({ qrCodeScanner }) => address.value = qrCodeScanner as string || '', { deep: true })

// The state is not reactive, so we need to watch it and update the state manually
// eslint-disable-next-line vue/no-mutating-props
watch(address, value => props.state.qrCodeScanner = value || '')
</script>

<template>
  <div class="flex flex-col self-start w-full h-full pt-8">
    <div class="mt-28 mx-auto">
      <div class="flex gap-x-8 mt-28 mx-auto justify-center">
        <input v-model="address" type="text">
      </div>
      <p v-if="errorMsg" class="text-tomato text-center">
        {{ errorMsg }}
      </p>
      <button @click="$emit('done')">
        Scan QR code
      </button>

      <p class="mt-10 text-lg">
        {{ address }}

        Fun fact! Opening the camera, then close it and then open it again does not work. Alberto, add it to the list 🦈
      </p>
    </div>

    <IonButton :disabled="!address" size="small" class="text-base font-bold mt-auto w-full" @click="$emit('done', address)">
      Save
    </IonButton>
  </div>
</template>
