<script setup lang="ts">
import { IonButton, alertController, modalController } from '@ionic/vue'
import { computed, ref, watch, watchEffect } from 'vue'
import { getCountries, getCountryCallingCode } from 'libphonenumber-js/mobile'
import { storeToRefs } from 'pinia'
import { useTimestamp } from '@vueuse/core'
import CountrySelectModal from '@/components/CountrySelectModal.vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { i18n } from '@/i18n/i18n-setup'
import { useApp } from '@/stores/app'
import { usePoints } from '@/stores/points'
import { countdownTo } from '@/composables/useTime'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, stepName: { type: String, required: false }, isVisible: { type: Boolean, default: false } })
const emit = defineEmits(stepEmits)

const { language } = storeToRefs(useApp())
const { nextRequestCapTs } = storeToRefs(usePoints())
const timestamp = useTimestamp({ interval: 1000 })
const nextRequestIn = computed(() => {
  const { minutes, seconds } = countdownTo(nextRequestCapTs.value, timestamp.value)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})
const showCountdown = ref(false)
watchEffect(() => {
  if (props.errorMsg || !props.isVisible)
    showCountdown.value = false
  else
    showCountdown.value = nextRequestCapTs.value > timestamp.value
})

const isFocussed = ref(false)
const phoneNumberInput = ref('')
const errorMessage = ref('')
const regionNames = computed(() => new Intl.DisplayNames([language.value], { type: 'region' }))
const countryFilter = ref('')
const countries = computed(() => {
  return getCountries()
    .map((country) => {
      const callingCode = getCountryCallingCode(country)
      return {
        countryCode: country,
        callingCode,
        countryName: regionNames.value.of(country) || country,
      }
    })
    .filter(country => country.countryName.toLowerCase().includes(countryFilter.value.toLowerCase()))
    .sort((a, b) => a.countryName.localeCompare(b.countryName))
})
// Set current country (based on device language) as default or first country in list
const selectedCountry = ref(countries.value.find(country => country.countryCode === (new Intl.Locale(navigator.language)).region) || countries.value[0])
const phoneNumber = computed(() => `+${selectedCountry.value.callingCode} ${phoneNumberInput.value}`)

function showAlert() {
  alertController
    .create({
      header: i18n.t('Is this your phone number?'),
      message: phoneNumber.value,
      buttons: [
        { text: i18n.t('Cancel'), handler: () => emit('focus') },
        { text: i18n.t('Continue'), handler: handleSubmit },
      ],
    })
    .then(alert => alert.present())
}

function handleSubmit() {
  window.setTimeout(() => emit('done', phoneNumber.value), 200)
}

watch(() => props.errorMsg, () => {
  const { errorMsg } = props
  if (!errorMsg) {
    errorMessage.value = ''
    return
  }

  // Try to parse server error message from message prop in server response json in (potentially translated) api() error
  // message. Note that the server error message itself has also been translated on the server.
  const serverErrorMessageMatch = errorMsg.match(/"message":\s*("(?:\\"|[^"])+")/i)
  errorMessage.value = serverErrorMessageMatch
    ? JSON.parse(serverErrorMessageMatch[1]) as string // decode json encoded message string, resolving potential escape sequences
    : errorMsg
})

async function openModal() {
  const modal = await modalController.create({
    component: CountrySelectModal,
    handle: false,
    canDismiss: true,
    initialBreakpoint: 1,
    breakpoints: [0, 1],
  })

  modal.present()

  const { data, role } = await modal.onWillDismiss()

  if (role === 'confirm')
    selectedCountry.value = data
}
</script>

<template>
  <div class="flex flex-col self-start w-full h-full mt-8">
    <div class="relative grid grid-cols-[auto_0px_1fr] items-center w-full gap-x-4 border-2 border-space-space-200 rounded-lg p-4" :class="{ 'border-sky-sky-400': isFocussed }">
      <button aria-label="select calling code" class="text-base text-space/60" @click="openModal">
        +{{ selectedCountry.callingCode }}
      </button>
      <div class="h-[calc(100%+32px)] w-0 border border-space-space-200" :class="{ 'border-sky-sky-400': isFocussed }" />
      <input
        v-model="phoneNumberInput" :placeholder="$t('Your number')" type="tel" class="border-none focus:outline-none focus:ring-0"
        :name="stepName"
        size="16"
        @keydown.enter="showAlert"
        @focus="isFocussed = true"
        @blur="isFocussed = false"
      >
    </div>
    <p class="mt-1 text-sm font-semibold text-center text-space/50">
      {{ $t('Standard rates may apply.') }}
    </p>
    <Transition name="slide-fade">
      <p v-if="showCountdown" class="mt-4 text-sm font-semibold text-center text-space/80">
        {{ $t('You can try again in') }} {{ nextRequestIn }}
      </p>
    </Transition>
    <Transition name="slide-fade">
      <p v-if="errorMessage" class="mx-auto mt-8 text-center text-pumpkin">
        {{ errorMessage }}
      </p>
    </Transition>
    <div class="flex flex-col justify-center w-full pb-2 mt-auto">
      <IonButton size="small" class="text-base font-bold" :disabled="phoneNumberInput.length < 4 || nextRequestCapTs > timestamp" @click="showAlert">
        {{ $t('Verify') }}
      </IonButton>
      <IonButton v-if="canSkip" fill="clear" class="text-base font-bold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="$emit('skip')">
        {{ $t('Skip for now') }}
      </IonButton>
    </div>
  </div>
</template>
