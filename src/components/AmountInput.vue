<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { useApp } from '@/stores/app'

const props = defineProps({
  modelValue: {
    type: Number,
    default: 0,
  },
  decimals: {
    type: Number,
    default: 2,
  },
})

const emit = defineEmits({
  'update:modelValue': (_value: number) => true,
})

const { selectedFiat } = storeToRefs(useApp())

const fullWidth = ref<HTMLDivElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const widthPlaceholder = ref<HTMLSpanElement | null>(null)
const widthValue = ref<HTMLSpanElement | null>(null)

const { decimals } = props
const liveValue = ref('')
const lastEmittedValue = ref(0)
const width = ref(80)
const inputValue = ref(0)
const isFocussed = ref(false)

const formattedValue = computed({
  get() {
    return liveValue.value
  },
  set(value: string | number) {
    if (typeof value === 'number')
      value = value.toString()

    liveValue.value = value

    if (!value) {
      liveValue.value = ''
      lastEmittedValue.value = 0
      inputValue.value = 0
      emit('update:modelValue', inputValue.value)
      return
    }

    value = value.replace(/,/, '.')
    const regExp = new RegExp(`(\\d*)(\\.(\\d{0,${decimals}}))?`, 'g') // Backslashes are escaped
    const regExpResult = regExp.exec(value)!
    if (regExpResult[1] || regExpResult[2]) {
      liveValue.value = `${regExpResult[1] ? regExpResult[1] : '0'}${regExpResult[2] ? regExpResult[2] : ''}`
      inputValue.value = Number(
        `${regExpResult[1]}${(regExpResult[2] ? regExpResult[3] : '').padEnd(decimals, '0')}`,
      )
    }
    else {
      liveValue.value = ''
      inputValue.value = 0
    }

    if (lastEmittedValue.value !== inputValue.value) {
      emit('update:modelValue', inputValue.value)
      lastEmittedValue.value = inputValue.value
    }
  },
})

function updateValue(newValue: number) {
  if (newValue === inputValue.value)
    return

  lastEmittedValue.value = newValue || 0
  formattedValue.value = newValue.toString() ? (newValue / 10 ** decimals).toString() : ''
  updateWidth()
}

async function updateWidth() {
  await nextTick() // Await updated DOM
  if (!widthPlaceholder.value || !widthValue.value)
    return
  const placeholderWidth = widthPlaceholder.value.offsetWidth - 40
  const valueWidth = widthValue.value.offsetWidth

  width.value = (formattedValue.value ? valueWidth : placeholderWidth)
}

watch(formattedValue, updateWidth)
watch(
  () => props.modelValue,
  (newValue: number | undefined) => newValue && updateValue(newValue),
  { immediate: true },
)
</script>

<template>
  <div class="flex items-baseline justify-center w-full transition-colors duration-200 text-7xl" :class="isFocussed ? 'text-sky' : inputValue > 0 ? 'text-space' : 'text-space/50'">
    <form ref="fullWidth" class="relative flex h-full max-w-full p-1 overflow-hidden" @submit.prevent="">
      <span ref="widthPlaceholder" class="width-finder"> 0 </span>
      <span ref="widthValue" class="width-finder">{{ formattedValue || '' }}</span>
      <input
        ref="input"
        :value="formattedValue"
        type="number"
        name="amount"
        inputmode="decimal"
        class="max-w-full px-1 py-0 text-center transition-all border-none rounded-lg duration-[50ms] border-space/10 outline-0 bg-clip-padding"
        placeholder="0"
        pattern="[0-9]*"
        :style="{ 'width': `${width}px`, 'box-shadow': `inset 0 0 0 .15rem ${isFocussed ? 'var(--border-color-focus)' : 'var(--border-color)'}` }"
        @input="formattedValue = ($event.target as HTMLTextAreaElement).value"
        @focus="isFocussed = true"
        @blur="isFocussed = false"
      >
    </form>
    <span class="ml-4 text-3xl font-bold leading-10">{{ selectedFiat }}</span>
  </div>
</template>

<style scoped>
.width-finder {
    @apply absolute text-transparent pointer-events-none select-none whitespace-pre p-5;
}

input {
  --border-color: theme(colors.space.space-200);
  --border-color-focus: theme(colors.sky.sky-400);
}
</style>
