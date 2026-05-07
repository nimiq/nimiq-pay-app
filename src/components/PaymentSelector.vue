<script setup lang="ts">
import type { Step } from '@/lib/flows/steps.types'
import { storeToRefs } from 'pinia'
import { computed, useTemplateRef } from 'vue'
import { i18n } from '@/i18n/i18n-setup'
import { isNakaEnabled } from '@/lib'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useNaka } from '@/stores/naka'

const { activeStep } = defineProps<{ activeStep?: Step }>()

const emit = defineEmits(stepEmits)

const { isNimiqAsset } = storeToRefs(useApp())
const { isCardActive, isCardLocked } = storeToRefs(useNaka())

const showNakaOption = computed(() => isNakaEnabled && isNimiqAsset.value && isCardActive.value && !isCardLocked.value)
const options = computed(() => [
  ...(showNakaOption.value ? [{ label: i18n.t('Naka'), value: StepName.HoldNakaCardToReader }] : []),
  { label: i18n.t('Scan QR'), value: StepName.QRCodeScanner },
])
const stepNames = computed(() => options.value.map(option => option.value))

const shouldBeDisplayed = computed(() => options.value.length > 1 && activeStep && stepNames.value.includes(activeStep.step))

const pillSlider = useTemplateRef<HTMLSpanElement>('pillSlider')
const activeOptionIndex = computed(() => {
  const index = options.value.findIndex(option => option.value === activeStep?.step)
  return index >= 0 ? index : 0
})

function onClick(optionValue: StepName, e: PointerEvent) {
  const button = e.currentTarget as HTMLButtonElement
  pillSlider.value!.style.transform = `translateX(${button.offsetLeft}px)`

  emit('navigateTo', { step: optionValue })
}
</script>

<template>
  <transition
    mode="out-in"
    enter-from-class="translate-y-full" enter-active-class="transition-all duration-500 ease-out" enter-to-class="translate-y-0"
    leave-from-class="translate-y-0" leave-active-class="transition-all duration-500 ease-out" leave-to-class="translate-y-full"
  >
    <div v-if="shouldBeDisplayed" class="w-full h-max bg-white flex items-center justify-center bottom-bar">
      <div class="w-max p-1 my-2 bg-space/10 h-full rounded-full">
        <!-- Base buttons -->
        <ul class="relative grid grid-cols-2 justify-center items-center gap-x-0 p-1">
          <span ref="pillSlider" class="absolute h-full w-1/2 rounded-full left-0 transition-all translate-x-0 duration-[350ms]" style="background: var(--radial-gradient-light-blue);" />
          <li v-for="(option, index) in options" :key="option.label" class="w-full z-10">
            <button
              class="uppercase font-bold py-3 px-6 rounded-full w-full transition-colors duration-300"
              :class="activeOptionIndex === index ? 'text-white' : 'text-space/50'"
              @click="(e) => onClick(option.value, e)"
            >
              {{ option.label }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.bottom-bar {
  padding-bottom: var(--ion-safe-area-bottom, 0px);
  box-shadow: 0px 0px 4px 0px rgba(31, 35, 72, 0.03),
              0px 0px 12px 0px rgba(31, 35, 72, 0.05),
              0px 0px 32px 0px rgba(31, 35, 72, 0.06),
              0px 0px 80px 0px rgba(31, 35, 72, 0.07);
}
</style>
