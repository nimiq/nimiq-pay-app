<script setup lang="ts">
import { ref } from 'vue'
import { PinInputInput, PinInputRoot } from 'radix-vue'
import { storeToRefs } from 'pinia'
import { stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'

defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, inputLength: { type: Number, required: true } })

defineEmits(stepEmits)

const { phoneNumber } = storeToRefs(useApp())

const pinCodeInput = ref<string[]>([])

// TODO: access SMS and auto get the access code
</script>

<template>
  <p class="text-pretty text-center opacity-60 underline">
    {{ phoneNumber }}
  </p>
  <div class="flex justify-center w-full mt-16">
    <PinInputRoot
      id="pin-input"
      otp
      type="number"
      v-model="pinCodeInput"
      class="flex items-center gap-2"
      @complete="() => $emit('done', pinCodeInput.join(''))"
    >
      <PinInputInput
        v-for="(id, index) in inputLength "
        :key="id"
        :index="index"
        class="min-w-[10px] max-w-[40px] w-full text-center bg-white rounded-lg h-14 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white border-space/40"
      />
    </PinInputRoot>
    <p v-if="errorMsg" class="m-auto text-pumpkin">
      {{ errorMsg }}
    </p>
  </div>
</template>
