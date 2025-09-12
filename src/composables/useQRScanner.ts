import type { Fn } from '@vueuse/core'
import type { scan as Scan } from 'qr-scanner-wechat'
import type { Ref } from 'vue'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import { CameraPreview } from '@capgo/camera-preview'
import { until, useIntervalFn, useThrottleFn } from '@vueuse/core'
import { ready, scan } from 'qr-scanner-wechat'
import { ref } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { base64ToImageData } from '@/lib/utils'
import { useLocalWallet } from '@/stores/local-wallet'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { isDev } from '../lib'
import { useCameraFeed } from './useCameraFeed'
import { useDevice } from './useDevice'
import { QRDataFormat, useStringParser } from './useStringParser'
import { useToast } from './useToast'

const logger = useLogger('useQRScanner')

export enum QRScannerState {
  Idle = 'idle',
  Scanning = 'scanning',
  NoPermission = 'no-permission',
}

export type QRData<T = QRDataFormat> = T extends QRDataFormat.PaymentRequest ? PaymentRequestData : string

interface UseQRScannerOptions<T = QRDataFormat> {
  onData: (data: QRData<T>) => any
  onError: (error: string) => any
  expect: QRDataFormat
  cameraFeedContainer: Ref<HTMLElement>
}

export function useQRScanner({ expect, onError, onData, cameraFeedContainer }: UseQRScannerOptions) {
  // Block parallel invocations, as multiple parallel successful scans would lead to the onData success callback being
  // called multiple times, which can lead to problems for example in Flow.vue where goToNext would be called multiple
  // times. Additionally also add throttling to avoid spamming the apis also on failing api calls.
  let isParsingString = false
  const parseString = useThrottleFn(
    async (raw: string) => {
      if (isParsingString)
        return
      isParsingString = true
      try {
        const { getCashlink, getNimAddress, getPaymentRequestData } = useStringParser()
        if (expect === QRDataFormat.NimiqAddress) {
          const { data, error } = getNimAddress(raw)
          if (error || !data)
            throw new Error(error)
          onData(data)
        }
        else if (expect === QRDataFormat.PaymentRequest) {
          // Some users might scan an address QR code wanting to withdraw, if this is the case, redirect to the withdraw flow
          const { data: nimAddress } = getNimAddress(raw)
          if (nimAddress) {
            initializeFlow(FlowName.NimWithdraw, { initialState: { nimAddressInput: nimAddress } })
            return
          }

          const { data, error } = await getPaymentRequestData(raw)
          if (error || !data)
            throw new Error(error)

          // Redirect to withdraw if amount is 0
          if (data.amount === 0) {
            initializeFlow(FlowName.NimWithdraw, { nimAddressInput: data.recipient })
            return
          }

          onData(data)
        }
        else if (expect === QRDataFormat.NimCashlink) {
          const { data, error } = getCashlink(raw)
          if (error || !data)
            throw new Error(error)
          // TODO: move this to step
          await useNimiqNetwork().claimCashlink(data, useLocalWallet().localAddress)
          useToast().setToast({ message: i18n.t('Cashlink claimed successfully') })
          onData('')
        }
        // No translation as not user-facing. It's a dev error, which shouldn't occur in production.
        else {
          throw new Error(`Invalid QRDataFormat. Use any of ${Object.values(QRDataFormat)}`)
        }
      }
      catch (error) {
        onError((error as Error).message || i18n.t('Invalid QR code'))
      }
      finally {
        isParsingString = false
      }
    },
    1500,
    /* trailing */ false, // ignore repeated call and do not schedule it to run after throttle time
    /* leading */ true, // run immediately on first call
  )

  const { setUpCameraFeed, tearDownCameraFeed, hasPermission } = useCameraFeed(cameraFeedContainer)
  const { startScan, stopScan } = (useDevice().isWeb ? useQRScannerWeb : useQRScannerMobile)({ parseString, onError })
  const state = ref(QRScannerState.Idle)

  async function start() {
    if (state.value === QRScannerState.Scanning)
      return

    const video = await setUpCameraFeed()
    if (!hasPermission.value) {
      state.value = QRScannerState.NoPermission
      useToast().setToast({ message: i18n.t('No permission to use the camera'), type: 'error' })
      logger.error('No permission to use the camera')
      return
    }
    await startScan({ video })
    state.value = QRScannerState.Scanning
  }

  async function stop() {
    state.value = QRScannerState.Idle
    await Promise.all([
      tearDownCameraFeed(),
      stopScan(),
    ])
  }

  // setDummyData is only used in development mode to test the scanner. In production, it's a no-op.
  let setDummyData = () => {}
  if (isDev) {
    setDummyData = () => {
      const dummyData = {
        [QRDataFormat.NimiqAddress]: 'NQ23UAHEYH2K7B9KS9E6A0HFXA5H8H8SDQ7L',
        [QRDataFormat.PaymentRequest]: 'nimiq:NQ048XAKRA3761CA0CE5GKB670MDBJ8VN7FQ?amount=1&message=Ref%20%23YF8p&label=Maxiii&cpl_id=YF8pjO1y',
        [QRDataFormat.NimCashlink]: 'NOT_IMPLEMENTED___IT_WILL_RAISE_AN_ERROR',
      }[expect]

      logger.log(`💫 Using dummy data for QR scanner: ${dummyData}`)
      parseString(dummyData)
    }
  }

  return {
    start,
    stop,
    state,
    setDummyData,
  }
}

interface UseQRScannerDeviceOptions {
  parseString: (raw: string) => any
  onError: (error: string) => any
}

interface StartScannerOptions {
  video: HTMLVideoElement | void
}

function useQRScannerWeb({ parseString, onError }: UseQRScannerDeviceOptions) {
  let stopScan: Fn | undefined
  let resumeScan: Fn | undefined

  async function scanFrame(video: HTMLVideoElement, scan: typeof Scan) {
    if (!video.videoWidth || !video.videoHeight)
      return // video not ready yet
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx!.drawImage(video, 0, 0, canvas.width, canvas.height)
    const { text: result } = await scan(canvas)

    if (result)
      parseString(result)
  }

  async function startScan({ video }: StartScannerOptions) {
    if (resumeScan) {
      resumeScan()
      return
    }

    // The first time, we need to download the model, so it will take some time
    let didTimeout = false
    const timeout = window.setTimeout(() => {
      didTimeout = true
      onError?.(i18n.t('The QR scanner is not ready yet. Please wait.'))
    }, 10000)
    await ready()
    clearTimeout(timeout)
    if (didTimeout)
      // Clear error message
      onError?.('')

    const { resume, pause } = useIntervalFn(() => scanFrame(video!, scan), 300, { immediate: true })
    stopScan = pause
    resumeScan = resume
  }

  return {
    startScan,
    stopScan: () => stopScan?.(), // invoke stopScan if set
  }
}

function useQRScannerMobile({ parseString, onError }: UseQRScannerDeviceOptions) {
  let stopInterval: Fn | undefined
  const isScanning = ref(false)
  const isCameraStarted = ref(false)

  async function scanFrame(frame: string, scan: typeof Scan) {
    const image = await base64ToImageData(frame)
    const { text: result } = await scan(image)
    if (result)
      parseString(result)
  }

  async function startScan(_options: StartScannerOptions) {
    try {
      if (!isCameraStarted.value) {
        await CameraPreview.start({ toBack: true, disableAudio: true })
        isCameraStarted.value = true
      }
    }
    catch (e) {
      const ignoreErrors = ['camera already started', 'camera initialization in progress']
      if (!ignoreErrors.some(error => (e as Error).message.includes(error))) {
        onError?.(i18n.t('Something went wrong while starting the camera'))
        return
      }
    }
    // The first time, we need to download the model, so it will take some time
    let didTimeout = false
    const timeout = window.setTimeout(() => {
      didTimeout = true
      onError?.(i18n.t('The QR scanner is not ready yet. Please wait.'))
    }, 10000)
    await ready()
    clearTimeout(timeout)
    if (didTimeout)
    // Clear error message
      onError?.('')

    const { pause } = useIntervalFn(async () => {
      if (isScanning.value || !isCameraStarted.value)
        return
      isScanning.value = true
      try {
        const { value: frame } = await CameraPreview.captureSample({ quality: 100 })
        await scanFrame(frame, scan)
      }
      catch (e) {
        console.error('Error capturing sample or scanning frame', e)
        if (e) {
          logger.error('Error capturing sample or scanning frame:', e)
          if ((e as Error).message.includes('captureSessionIsMissing')) {
            stopScan()
          }
        }
      }
      isScanning.value = false
    }, 300, { immediate: true })
    stopInterval = pause
  }

  async function stopScan() {
    isScanning.value = false
    stopInterval?.()
    try {
      await until(isCameraStarted).toBe(true, { timeout: 5000 })
      await CameraPreview.stop()
    }
    catch (e) {
      const ignoreErrors = ['camera already stopped', 'cannot stop camera while initialization is in progress', 'camera not initialized']
      if (!ignoreErrors.some(error => (e as Error).message.includes(error)))
        logger.error('Error while stopping camera preview:', e)
    }
    isCameraStarted.value = false
  }

  return {
    startScan,
    stopScan,
  }
}
