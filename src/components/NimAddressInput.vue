<script setup lang="ts">
import type { PropType } from 'vue'
import { ref, toRefs, watch } from 'vue'
import { IonButton } from '@ionic/vue'
import type { State } from '@/types/steps'
import { stepEmits } from '@/types/steps'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
defineEmits(stepEmits)

const address = ref<string>()
watch(() => toRefs(props.state), ({ qrCodeScanner }) => address.value = qrCodeScanner.value as string || '', { deep: true })
</script>

<template>
  <div class="flex flex-col self-start w-full h-full pt-8">
    <div class="mx-auto mt-28">
      <div class="flex justify-center mx-auto gap-x-8 mt-28">
        <input v-model="address" type="text">
      </div>
      <p v-if="errorMsg" class="text-center text-tomato">
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

    <IonButton :disabled="!address" size="small" class="w-full mt-auto text-base font-bold" @click="$emit('done', address)">
      Save
    </IonButton>
  </div>
</template>
