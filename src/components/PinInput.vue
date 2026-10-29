<script setup lang="ts">
import type { PropType } from 'vue'
import type { PinReceiver } from '@/composables/useSharedPinInput'
import type { State } from '@/lib/flows/steps.types'
import { Haptics, NotificationType } from '@capacitor/haptics'
import { until } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'
import { useBiometric } from '@/composables/useBiometric'
import { useLogger } from '@/composables/useLogger'
import { useSharedPinInput } from '@/composables/useSharedPinInput'
import { stepEmits } from '@/lib/flows/steps.types'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({
  errorMsg: { type: String },
  inputLength: { type: Number, required: true },
  isScrolling: { type: Boolean, required: false },
  isActive: { type: Boolean, required: false },
  showLoading: { type: Boolean, required: false },
  stepName: { type: String, required: false },
  state: { type: Object as PropType<State>, required: false },
  canUseBiometric: { type: Boolean, required: false },
  shouldAutoFocus: { type: Boolean, required: false },
})
const emit = defineEmits(stepEmits)

const logger = useLogger('PinInput')
const { updateBiometryInfo, addBiometricResumeListener, removeBiometricResumeListener, getPinFromSecureStorage, isBiometricEnabled, isBiometricSupported, BiometryErrorType } = useBiometric()
const inputRef = ref<HTMLInputElement | null>(null)
// Focus state of the standalone local input; flow steps derive focus from isActive (see isInputFocused).
const localFocused = ref(false)
const pinCodeInput = ref('')
const wiggle = ref(false)
const isLoading = ref(false)
// Delay the spinner so a fast result (wrong PIN) doesn't blur the input and flash the keyboard.
const LOADING_DELAY = 500
let loadingTimer: number | undefined
const customError = ref('')

// Flow steps (which pass a stepName) share a single hidden <input> so focus never has to hand off between the
// enter-PIN and confirm-PIN slides. Standalone usages keep their own local <input> (rendered below).
const isFlowStep = !!props.stepName
// Drives the dot bounce animation: flow steps have no local input, so focus tracks isActive; standalone tracks
// the local input's focus/blur.
const isInputFocused = computed(() => (isFlowStep ? !!props.isActive : localFocused.value))
const sharedPin = useSharedPinInput()
const receiver: PinReceiver = {
  id: Symbol('pin'),
  inputLength: props.inputLength,
  getValue: () => pinCodeInput.value,
  setValue: (value) => { pinCodeInput.value = value },
  canAccept: () => !wiggle.value && !isLoading.value,
}

if (isFlowStep)
  sharedPin.register(receiver)

// Route the shared input to whichever step is active. isActive is set synchronously on navigation (step ===
// activeStep), so it never depends on the IntersectionObserver and can't leave input permanently blocked.
watch(() => props.isActive, (isActive) => {
  if (!isFlowStep)
    return
  if (isActive)
    sharedPin.setActive(receiver)
  else
    sharedPin.clearActive(receiver)
}, { immediate: true })

watch(pinCodeInput, async (pin) => {
  if (isFlowStep)
    sharedPin.syncValue(receiver)

  if (pin.length === props.inputLength) {
    logger.log('🔢 PIN complete, emitting done')
    emit('done', pin)
    if (props.showLoading) {
      loadingTimer = window.setTimeout(() => {
        isLoading.value = true
      }, LOADING_DELAY)
    }

    // Clear input when component is invisible, this will allow to clear the input without the user seeing it
    // and when the users goes back to this component, the input will be empty.
    // Only do this if the stepName is defined, as this is a step in a flow, and not a standalone component.
    if (props.stepName && !props.errorMsg) {
      await until(() => props.isScrolling).toBe(true, { timeout: 1000 })
      await until(() => props.isScrolling).toBe(false, { timeout: 1000 })
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
    window.clearTimeout(loadingTimer)
    isLoading.value = false
    // Loading blurred the standalone input; refocus so the user can retype without tapping.
    inputRef.value?.focus()
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
  const target = event.target as HTMLInputElement
  // Standalone-only local input. Ignore keystrokes during the error wiggle and reset the DOM value so a
  // stray tap can't leak into the next accepted keystroke.
  if (wiggle.value) {
    target.value = pinCodeInput.value
    return
  }
  pinCodeInput.value = target.value
}

function focusInput() {
  if (isFlowStep)
    sharedPin.focus()
  else
    inputRef.value?.focus()
}

function handleInputClick(i: number) {
  // Editing pinCodeInput triggers the watcher above, which pushes the change to the shared input via syncValue.
  if (pinCodeInput.value.length > 0)
    pinCodeInput.value = pinCodeInput.value.slice(0, -(pinCodeInput.value.length - i) - 1)
  focusInput()
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

onBeforeUnmount(() => {
  window.clearTimeout(loadingTimer)
  removeBiometricResumeListener()
  if (isFlowStep)
    sharedPin.unregister(receiver)
})
</script>

<template>
  <div class="my-auto w-full relative flex items-center justify-center">
    <Transition name="slide-fade" mode="out-in">
      <LoadingSpinner
        v-if="isLoading" class="text-space w-8 h-8"
      />
      <div
        v-else
        class="flex justify-center gap-x-8 px-2 py-4" :class="{ 'animate-wiggle': wiggle }" @click="focusInput"
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
  <!-- Standalone usages keep a local input; flow steps use the shared hidden input (useSharedPinInput). -->
  <input
    v-if="!stepName"
    ref="inputRef" type="password" inputmode="numeric" class="caret-transparent sr-only" pattern="[0-9]*"
    autocomplete="false" onpaste.prevent ondrop.prevent
    :aria-label="stepName"
    :minlength="inputLength" :maxlength="inputLength" :size="inputLength"
    :value="pinCodeInput"
    @input="handleInput"
    @focus="localFocused = true"
    @blur="localFocused = false"
  >
</template>
