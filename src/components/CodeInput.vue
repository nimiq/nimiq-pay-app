<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { PinInputInput, PinInputRoot } from 'radix-vue'
import { storeToRefs } from 'pinia'
import { stepEmits } from '@/types/steps'
import { usePoints } from '@/stores/points'
import { useApp } from '@/stores/app'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, inputLength: { type: Number, required: true } })

defineEmits(stepEmits)

const { accessCode } = storeToRefs(usePoints())
const { phoneNumber } = storeToRefs(useApp())

const pinCodeInput = ref<string[]>([])

watch(accessCode, () => {
  if (!accessCode.value)
    return
  // TODO: this is not going to be in production
  setTimeout(() => pinCodeInput.value = accessCode.value.toString().padStart(props.inputLength, '0').split(''), 500)
})
</script>

<template>
  <p class="[text-wrap:pretty] text-center opacity-60 underline">
    {{ phoneNumber }}
  </p>
  <div class="flex justify-center w-full mt-16">
    <PinInputRoot
      id="pin-input"
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
    <p v-if="errorMsg">
      {{ errorMsg }}
    </p>
  </div>
</template>
