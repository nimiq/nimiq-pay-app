<script setup lang="ts">
import type { PropType } from 'vue'
import type { State } from '@/lib/flows/steps.types'
import { Haptics, NotificationType } from '@capacitor/haptics'
import { until } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'
import { useBiometric } from '@/composables/useBiometric'
import { useLogger } from '@/composables/useLogger'
import { stepEmits } from '@/lib/flows/steps.types'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({
  errorMsg: { type: String },
  inputLength: { type: Number, required: true },
  isScrolling: { type: Boolean, required: false },
  showLoading: { type: Boolean, required: false },
  stepName: { type: String, required: false },
  state: { type: Object as PropType<State>, required: false },
  canUseBiometric: { type: Boolean, required: false },
  shouldAutoFocus: { type: Boolean, required: false },
})
const emit = defineEmits(stepEmits)

const logger = useLogger('PinInput')
const { updateBiometryInfo, addBiometricResumeListener, removeBiometricResumeListener, getPinFromSecureStorage, isBiometricEnabled, isBiometricSupported, BiometryErrorType } = useBiometric()
const isScrolling = computed(() => props.isScrolling)
const inputRef = ref<HTMLInputElement | null>(null)
const isInputFocused = ref(false)
const pinCodeInput = ref('')
const wiggle = ref(false)
const isLoading = ref(false)
const customError = ref('')

watch(pinCodeInput, async (pin) => {
  if (pin.length === props.inputLength) {
    logger.log('🔢 PIN complete, emitting done')
    emit('done', pin)
    if (props.showLoading)
      isLoading.value = true

    // Clear input when component is invisible, this will allow to clear the input without the user seeing it
    // and when the users goes back to this component, the input will be empty.
    // Only do this if the stepName is defined, as this is a step in a flow, and not a standalone component.
    if (props.stepName && !props.errorMsg) {
      await until(isScrolling).toBe(true, { timeout: 1000 })
      await until(isScrolling).toBe(false, { timeout: 1000 })
    }
    clearInput()
  }
})

watch(() => props.errorMsg, (msg) => {
  if (msg) {
    wiggle.value = true
    window.setTimeout(() => {
      wiggle.value = false
    }, 300)
    isLoading.value = false
    clearInput()
    customError.value = msg
    Haptics.notification({ type: NotificationType.Error })
  }
})

watch(isLoading, (loading) => {
  if (loading)
    inputRef.value?.blur()
})

function handleInput(event: Event) {
  // Prevent input when there's an error message and the input is being animated
  if (wiggle.value)
    return
  const target = event.target as HTMLInputElement
  pinCodeInput.value = target.value
}

function handleInputClick(i: number) {
  if (pinCodeInput.value.length > 0)
    pinCodeInput.value = pinCodeInput.value.slice(0, -(pinCodeInput.value.length - i) - 1)
  inputRef.value?.focus()
}

function clearInput() {
  window.setTimeout(() => {
    pinCodeInput.value = ''
  }, 300)
}

onMounted(async () => {
  await updateBiometryInfo()
  addBiometricResumeListener()

  if (props.shouldAutoFocus) {
    window.setTimeout(() => {
      inputRef.value?.focus()
    }, 200)
  }

  if (props.canUseBiometric && isBiometricEnabled.value && isBiometricSupported.value) {
    logger.log('👆 biometric: getPinFromSecureStorage start')
    const { pinCode, success, error, errorType } = await getPinFromSecureStorage()
    logger.log('👆 biometric: done', { success, errorType, hasPin: !!pinCode })
    if (success && pinCode)
      pinCodeInput.value = pinCode.toString()
    else if (error && errorType !== BiometryErrorType.userCancel)
      customError.value = error
  }
})

onBeforeUnmount(removeBiometricResumeListener)
</script>

<template>
  <div class="my-auto w-full relative flex items-center justify-center">
    <Transition name="slide-fade" mode="out-in">
      <LoadingSpinner
        v-if="isLoading" class="text-space w-8 h-8"
      />
      <div
        v-else
        class="flex justify-center gap-x-8 px-2 py-4" :class="{ 'animate-wiggle': wiggle }" @click="inputRef?.focus()"
      >
        <div
          v-for="i in inputLength" :key="i"
          class="bg-space w-4 h-4 rounded-full transition-colors"
          :title="i.toString()"
          :class="{ 'opacity-40': pinCodeInput.length < i, 'animate-bounce': isInputFocused && pinCodeInput.length === i - 1 }"
          @click="handleInputClick(i)"
        />
      </div>
    </Transition>
    <p v-if="customError" class="text-pumpkin w-full absolute top-20 text-base text-center">
      {{ customError }}
    </p>
  </div>
  <input
    ref="inputRef" type="password" inputmode="numeric" class="caret-transparent sr-only" pattern="[0-9]*"
    autocomplete="false" onpaste.prevent ondrop.prevent
    :name="stepName"
    :aria-label="stepName"
    :minlength="inputLength" :maxlength="inputLength" :size="inputLength"
    :value="pinCodeInput"
    @input="handleInput"
    @focus="isInputFocused = true"
    @blur="isInputFocused = false"
  >
</template>
