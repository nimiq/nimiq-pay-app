<script setup lang="ts">
import type { PropType, Ref } from 'vue'
import type { QRData } from '@/composables/useQRScanner'
import { watchDebounced } from '@vueuse/core'
import { ready } from 'qr-scanner-wechat'
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useDevice } from '@/composables/useDevice'
import { QRScannerState, useQRScanner } from '@/composables/useQRScanner'
import { QRDataFormat } from '@/composables/useStringParser'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { stepEmits } from '@/lib/flows/steps.types'
import { isDev } from '@/lib/index'

const props = defineProps({
  isVisible: { type: Boolean, required: true },
  errorMsg: { type: String },
  canSkip: { type: Boolean },
  expect: { type: String as PropType<QRDataFormat>, required: true },
})
const emit = defineEmits(stepEmits)

const cameraFeedContainer = ref() as Ref<HTMLDivElement>

async function onError(error: string) {
  const { useToast } = await import('@/composables/useToast')
  useToast().setToast({ message: error, type: 'error', duration: 5000 })
}
watch(() => props.errorMsg, (error) => {
  if (!error)
    return
  onError(error)
}, { immediate: true })

const cameraFeedContainerTop = ref(0)
watchEffect(() => {
  if (!props.isVisible)
    return
  let totalOffsetTop = 0
  let element: Element | null = cameraFeedContainer.value
  while (element instanceof HTMLElement) {
    totalOffsetTop += element.offsetTop
    element = element.offsetParent
  }
  cameraFeedContainerTop.value = totalOffsetTop
})

const onData = (data: QRData<typeof props.expect>) => emit('done', data)
const { setDummyData, start, stop, state } = useQRScanner({ expect: props.expect, cameraFeedContainer, onData, onError })

const { isWeb, isIOS } = useDevice()

watchDebounced(() => props.isVisible, async (isVisible) => {
  if (isVisible) {
    document.body.classList.toggle('native-qr-scanner-modal-open', !isWeb)
    useToast().setToast({ message: i18n.t('Activating scanner'), type: 'spinner', keepOpen: true })
    await start()
    useToast().clearToast()
  }
  else if (cameraFeedContainer.value) {
    // Stop scanner, if the container has actually been mounted yet.
    document.body.classList.remove('native-qr-scanner-modal-open')
    if (state.value === QRScannerState.Scanning)
      stop()
    useToast().clearToast()
  }
}, { immediate: true, debounce: 250, maxWait: 500 })

// Preload the scanner library
onMounted(ready)

onBeforeUnmount(() => {
  document.body.classList.remove('native-qr-scanner-modal-open')
  if (state.value === QRScannerState.Scanning)
    stop()

  if (props.isVisible)
    useToast().clearToast()
})

const isBtcLightningEnabled = __ENABLE_BTC_LN__

function handleManualInput() {
  emit('done')
}
</script>

<template>
  <div class="mt-8 px-0.5">
    <div v-if="isDev && expect !== QRDataFormat.NimCashlink" class="flex flex-col items-center mb-6" :class="{ 'absolute z-10  -translate-x-1/2 left-1/2 bottom-0': !isWeb }">
      <button class="block w-full text-sm font-normal text-center underline text-space/80" @click="setDummyData">
        Click here to use mockup data.<br>
      </button>
      <span class="mt-2 text-xs text-center opacity-70">

        It is <b>expected</b> that data in preview might be wrong
      </span>
    </div>

    <div v-if="isWeb" ref="cameraFeedContainer" class="relative pointer-events-none aspect-square" :class="{ 'bg-space/20 animate-pulse': state !== QRScannerState.Scanning }">
      <video autoplay muted playsinline :controls="false" :class="{ 'opacity-0': state !== QRScannerState.Scanning }" />
      <svg class="absolute -inset-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 232 232">
        <path stroke="#1F2348" stroke-width="2" d="M1 21V1M0 1h20M211 1h20M231 0v20M231 211v20M232 231h-20M21 230H1M1 231v-20" />
      </svg>
      <p v-if="state !== QRScannerState.NoPermission" class="absolute w-full text-center text-space/60 small:leading-5 -bottom-16">
        <span v-if="expect === QRDataFormat.PaymentRequest">
          <template v-if="isBtcLightningEnabled">
            {{ $t('Scan any Nimiq, Bitcoin Lightning or NAKA QR code to pay.') }}
          </template>
          <template v-else>
            {{ $t('Scan any Nimiq or NAKA QR code to pay.') }}
          </template>
        </span>
      </p>
    </div>
    <div v-else ref="cameraFeedContainer" class="absolute inset-0 grid place-content-center">
      <!-- On native, the camera is visible behind the webview. Put a transparent square in the center of the screen,
      through which the camera can be seen (other parent / background elements are made transparent in useCameraFeed),
      with a wide white border to cover the rest. -->
      <div class="relative m-auto box-border shadow-[0_0_0_100vh_white] w-[calc(100vw-6rem)]" :style="`top: -${cameraFeedContainerTop / 4}px`">
        <div class="aspect-square">
          <Transition name="fade">
            <div v-if="state === QRScannerState.Idle" class="h-full w-full bg-space/5" />
          </Transition>
          <svg class="absolute -inset-0.5" :class="{ '-mr-1': isIOS }" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 232 232">
            <path stroke="#1F2348" stroke-width="2" d="M1 21V1M0 1h20M211 1h20M231 0v20M231 211v20M232 231h-20M21 230H1M1 231v-20" />
          </svg>
        </div>
        <div class="flex flex-col bg-white gap-y-14 small:gap-y-10">
          <p v-if="state !== QRScannerState.NoPermission" class="w-full mt-5 text-center text-space/60 small:leading-5">
            <span v-if="expect === QRDataFormat.PaymentRequest">
              <template v-if="isBtcLightningEnabled">
                {{ $t('Scan any Nimiq, Bitcoin Lightning or NAKA QR code to pay.') }}
              </template>
              <template v-else>
                {{ $t('Scan any Nimiq or NAKA QR code to pay.') }}
              </template>
            </span>
          </p>
          <button
            v-if="expect === QRDataFormat.PaymentRequest"
            class="mx-auto bg-space/10 font-bold text-sm px-4 py-1.5 rounded-full"
            aria-label="Enter manually"
            @click="handleManualInput"
          >
            {{ $t('Enter manually') }}
          </button>
        </div>
      </div>
    </div>

    <p
      v-if="state === QRScannerState.NoPermission"
      class="mx-auto mt-8 text-center text-pumpkin small:leading-5"
      :class="{ 'absolute inset-x-8 bottom-8 small:inset-x-6 small:bottom-4': !isWeb }"
    >
      {{ $t('Please allow Nimiq Pay to access your camera and try again to scan QR codes.') }}
    </p>
  </div>
</template>

<style>
/* Non-scoped style on purpose, as we're manipulating parent elements (in an admittedly hacky fashion, which likely
still is better though than assigning styles via js) */

body.native-qr-scanner-modal-open ion-app > div {
  display: none;
}
body.native-qr-scanner-modal-open ion-modal {
  --ion-backdrop-color: transparent; /* make backdrop transparent */
  --background: transparent; /* make dialog background transparent */
  --overflow: visible; /* make ::before element defined below visible */
}
body.native-qr-scanner-modal-open ion-modal .ion-page::before {
  /* Simulate backdrop above modal. This area is typically var(--ion-safe-area-top) + 10px big (via definition of
  --height on ion-modal), but a larger area is visible when the user drags the modal down to close it. */
  content: '';
  position: absolute;
  width: 100%;
  height: 10%;
  bottom: 100%;
  background: #a9a9a9;
}
body.native-qr-scanner-modal-open ion-modal ion-header {
  background: white; /* avoid video shining through transparent paddings in header */
}
</style>
