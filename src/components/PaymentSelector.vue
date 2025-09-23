<script setup lang="ts">
import type { Step } from '@/lib/flows/steps.types'
import { useElementSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, useTemplateRef, watchEffect } from 'vue'
import { i18n } from '@/i18n/i18n-setup'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useNaka } from '@/stores/naka'

const { activeStep } = defineProps<{ activeStep?: Step }>()

const emit = defineEmits(stepEmits)

const { isCardActive, isCardLocked } = storeToRefs(useNaka())

const options = [
  ...(isCardActive.value && !isCardLocked.value ? [{ label: i18n.t('Naka'), value: StepName.HoldNakaCardToReader }] : []),
  { label: i18n.t('Scan QR'), value: StepName.QRCodeScanner },
].filter(Boolean) as { label: string, value: StepName }[]
const stepNames = options.map(o => o.value)

const shouldBeDisplayed = computed(() => options.length > 1 && activeStep && stepNames.includes(activeStep.step))

const activeOptionIndex = computed(() => options.findIndex(o => o.value === activeStep?.step) || 0)

const clipContainer = useTemplateRef<HTMLDivElement>('clipContainer')

const { width: containerWidth } = useElementSize(clipContainer)

watchEffect(() => {
  if (!clipContainer.value || !containerWidth.value || typeof activeOptionIndex.value !== 'number')
    return ''
  const activeBtn = clipContainer.value.querySelector(`li:nth-child(${activeOptionIndex.value + 1}) button`) as HTMLButtonElement
  if (!activeBtn)
    return ''
  const clipLeft = activeBtn.offsetLeft
  const clipRight = clipLeft + activeBtn.offsetWidth

  const clipPath = `inset(0 ${Number(100 - (clipRight / containerWidth.value) * 100).toFixed()}% 0 ${Number((clipLeft / containerWidth.value) * 100).toFixed()}% round 9999px)`
  clipContainer.value.style.clipPath = clipPath
})

function onClick(optionValue: StepName) {
  emit('navigateTo', { step: optionValue })
}
</script>

<template>
  <transition
    mode="out-in"
    enter-from-class="translate-y-full" enter-active-class="transition-all duration-500 ease-out" enter-to-class="translate-y-0"
    leave-from-class="translate-y-0" leave-active-class="transition-all duration-500 ease-out" leave-to-class="translate-y-full"
  >
    <div v-if="shouldBeDisplayed" class="w-full h-max bg-white">
      <div class="inline-block w-full p-1 bg-white h-full bottom-bar">
        <!-- Base buttons -->
        <ul class="relative flex justify-center items-center gap-x-3">
          <li v-for="option in options" :key="option.label" class="size-max">
            <button class="label text-space/50" @click="onClick(option.value)">
              {{ option.label }}
            </button>
          </li>
        </ul>

        <!-- Animated overlay -->
        <div aria-hidden class="absolute inset-1 overflow-hidden pointer-events-none">
          <div class="w-max mx-auto">
            <div ref="clipContainer" class="duration-[350ms] ease-out transition-[clip-path] bg-sky">
              <ul class="relative flex justify-center items-center gap-x-3 h-full">
                <li v-for="option in options" :key="option.label" class="size-max">
                  <button class="label text-white" tabindex="-1">
                    {{ option.label }}
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.bottom-bar {
  box-shadow: 0px 0px 80px rgba(31, 35, 72, 0.07),
              0px 0px 32px rgba(31, 35, 72, 0.058643),
              0px 0px 12px rgba(31, 35, 72, 0.045),
              0px 0px 4px rgba(31, 35, 72, 0.031357);
}

.label {
  @apply py-3 px-4 rounded-full focus:outline-none uppercase tracking-wider font-bold;
}
</style>
