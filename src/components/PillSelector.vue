<script setup lang="ts">
import { i18n } from '@/i18n/i18n-setup'
import { type Step, stepEmits, StepName } from '@/lib/flows/steps.types'
import { useElementSize, useResizeObserver } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  activeStep?: Step
}>()

const emit = defineEmits(stepEmits)

const options = [
  { label: i18n.t('Naka'), value: StepName.HoldNakaCardToReader },
  { label: i18n.t('Scan QR'), value: StepName.QRCodeScanner },
  { label: i18n.t('Bluecode'), value: StepName.BluecodePayment },
]

const activeOption = computed(() => options.find(o => o.value === props.activeStep?.step))

const clipContainer = ref<HTMLElement>()
const activeButton = ref<HTMLElement>()

const { width: containerWidth } = useElementSize(clipContainer)

// Update clip-path when active button or container resizes
useResizeObserver(activeButton, updateClipPath)

function setActiveButton(el: HTMLElement) {
  activeButton.value = el
}

function updateClipPath() {
  if (!activeButton.value || !containerWidth.value)
    return

  const { offsetLeft, offsetWidth } = activeButton.value
  const clipRight = offsetLeft + offsetWidth

  const rightPercent = Number((100 - (clipRight / containerWidth.value) * 100).toFixed())
  const leftPercent = Number(((offsetLeft / containerWidth.value) * 100).toFixed())

  clipContainer.value!.style.clipPath = `inset(0 ${rightPercent}% 0 ${leftPercent}% round 20px)`
}

watch(containerWidth, updateClipPath)
watch(
  () => activeOption.value,
  updateClipPath,
  { flush: 'post', immediate: true },
)

function navigateTo(step: StepName) {
  emit('navigateTo', { step })
}
</script>

<template>
  <div class="w-[300vw] bg-white h-[72px]">
    <div class="fixed inline-block w-screen h-full bottom-bar">
      <!-- Base buttons -->
      <ul class="relative flex justify-center gap-x-2 p-2">
        <li v-for="option in options" :key="option.label">
          <button class="label" :class="activeOption?.value === option.value ? 'text-white' : 'bg-white text-space/50'" @click="navigateTo(option.value)">
            {{ option.label }}
          </button>
        </li>
      </ul>

      <!-- Animated overlay -->
      <div
        ref="clipContainer"
        aria-hidden="true"
        class="absolute inset-0 overflow-hidden transition-[clip-path] duration-250 ease-out"
      >
        <ul class="relative flex justify-center gap-x-2 p-2">
          <li v-for="option in options" :key="option.label">
            <button
              :ref="option.value === activeOption?.value ? setActiveButton : null"
              class="label bg-sky"
              tabindex="-1"
              @click="emit('navigateTo', { step: option.value })"
            >
              {{ option.label }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Existing styles remain unchanged */
.bottom-bar {
  box-shadow: 0px 0px 80px rgba(31, 35, 72, 0.07),
              0px 0px 32.0004px rgba(31, 35, 72, 0.058643),
              0px 0px 12.5187px rgba(31, 35, 72, 0.045),
              0px 0px 4.12454px rgba(31, 35, 72, 0.031357);
}

.label {
  @apply py-2 px-4 rounded-full  focus:outline-none uppercase tracking-wider font-bold;
}
</style>
