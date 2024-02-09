<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { until } from '@vueuse/core'
import { stepEmits } from '@/lib/flows/steps.types'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({
  errorMsg: { type: String },
  canSkip: { type: Boolean },
  inputLength: { type: Number, required: true },
  isScrolling: { type: Boolean, required: false },
  showLoading: { type: Boolean, required: false },
  stepName: { type: String, required: false },
})
const emit = defineEmits(stepEmits)

const isScrolling = computed(() => props.isScrolling)
const inputRef = ref<HTMLInputElement | null>(null)
const isInputFocused = ref(false)
const pinCodeInput = ref('')
const wiggle = ref(false)
const isLoading = ref(false)

watch(pinCodeInput, async (pin) => {
  if (pin.length === props.inputLength) {
    wiggle.value = false
    emit('done', pin)
    if (props.showLoading)
      isLoading.value = true

    // Clear input when component is invisible, this will allow to clear the input without the user seeing it
    // and when the users goes back to this component, the input will be empty.
    await until(isScrolling).toBe(true, { timeout: 1000 })
    await until(isScrolling).toBe(false, { timeout: 1000 })
    pinCodeInput.value = ''
  }
})

watch(() => props.errorMsg, (msg) => {
  if (msg) {
    wiggle.value = true
    pinCodeInput.value = ''
    isLoading.value = false
  }
})

watch(isLoading, (loading) => {
  if (loading)
    inputRef.value?.blur()
})

function handleInputClick(i: number) {
  if (pinCodeInput.value.length > 0)
    pinCodeInput.value = pinCodeInput.value.slice(0, -(pinCodeInput.value.length - i) - 1)
  inputRef.value?.focus()
}
</script>

<template>
  <div class="m-auto">
    <Transition name="slide-fade" mode="out-in">
      <LoadingSpinner
        v-if="isLoading" class="w-8 h-8 m-auto text-space"
      />
      <div
        v-else
        class="flex justify-center px-2 py-4 mx-auto gap-x-8" :class="{ 'animate-wiggle': wiggle }" @click="inputRef?.focus()"
      >
        <div
          v-for="i in inputLength" :key="i"
          class="w-4 h-4 transition-colors rounded-full bg-space"
          :title="i.toString()"
          :class="{ 'opacity-40': pinCodeInput.length < i, 'animate-bounce': isInputFocused && pinCodeInput.length === i - 1 }"
          @click="handleInputClick(i)"
        />
      </div>
    </Transition>
    <p v-if="errorMsg" class="mt-12 text-base text-center text-pumpkin">
      {{ errorMsg }}
    </p>
  </div>
  <input
    ref="inputRef" type="password" inputmode="numeric" class="sr-only caret-transparent" pattern="[0-9]*"
    autocomplete="false" on-paste="return false" on-drop="return false"
    :name="stepName"
    :minlength="inputLength" :maxlength="inputLength" :size="inputLength"
    :value="pinCodeInput"
    @input="pinCodeInput = ($event.target as HTMLTextAreaElement).value"
    @focus="isInputFocused = true"
    @blur="isInputFocused = false"
  >
</template>
