<script setup lang="ts">
import { ref } from 'vue'
import { PinInputInput, PinInputRoot } from 'radix-vue'
import { storeToRefs } from 'pinia'
import { IonButton } from '@ionic/vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'

defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, inputLength: { type: Number, required: true }, backButtonText: { type: String } })

defineEmits(stepEmits)

const { phoneNumber } = storeToRefs(useApp())

const pinCodeInput = ref<string[]>([])

// TODO: access SMS and auto get the access code
</script>

<template>
  <p v-if="phoneNumber" class="text-center underline text-pretty opacity-60">
    {{ phoneNumber }}
  </p>
  <div class="flex flex-col items-center justify-center w-full mt-16">
    <PinInputRoot
      id="pin-input"
      v-model="pinCodeInput"
      otp
      type="number"
      class="flex items-center gap-2"
      @complete="() => $emit('done', pinCodeInput.join(''))"
    >
      <PinInputInput
        v-for="(id, index) in inputLength "
        :key="id"
        :index="index"
        class="min-w-[10px] max-w-[42px] w-full text-center bg-white rounded-lg h-14 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white border-space/40"
      />
    </PinInputRoot>
    <p class="m-auto text-pumpkin min-h-14">
      {{ errorMsg }}
    </p>
    <IonButton
      v-if="backButtonText"
      class="text-base font-semibold normal-case"
      fill="clear"
      @click="$emit('done', 'back')"
    >
      {{ backButtonText }}
    </IonButton>
  </div>
</template>
