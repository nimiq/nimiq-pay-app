import type { scan as Scan } from 'qr-scanner-wechat'
import { type Ref, ref } from 'vue'
import { useThrottleFn } from '@vueuse/core'
import { isDev } from '../lib'
import { useDevice } from './useDevice'
import { QRDataFormat, useStringParser } from './useStringParser'
import { useCameraFeed } from './useCameraFeed'
import { useToast } from './useToast'
import { i18n } from '@/i18n/i18n-setup'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLogger } from '@/composables/useLogger'

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
          const { data, error } = await getPaymentRequestData(raw)
          if (error || !data)
            throw new Error(error)
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
  const { startScan } = (useDevice().isWeb ? useQRScannerWeb : useQRScannerMobile)({ parseString, onError })
  const state = ref(QRScannerState.Idle)

  let stopScan: Function = () => {}

  async function start() {
    const video = await setUpCameraFeed()
    if (!hasPermission.value) {
      state.value = QRScannerState.NoPermission
      logger.error('No permission to use the camera')
      return
    }
    stopScan = await startScan({ video })
    state.value = QRScannerState.Scanning
  }

  async function stop() {
    await tearDownCameraFeed()
    stopScan()
    state.value = QRScannerState.Idle
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
  let stopScan: Function = () => {}
  let resumeScan: Function | undefined

  async function scanFrame(video: HTMLVideoElement, scan: typeof Scan) {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx!.drawImage(video, 0, 0, canvas.width, canvas.height)
    const { text: result } = await scan(canvas)

    if (result)
      parseString(result)
  }

  async function startScan({ video }: StartScannerOptions): Promise<Function> {
    if (resumeScan) {
      resumeScan()
      return stopScan
    }

    const { ready, scan } = await import('qr-scanner-wechat')

    // The first time, we need to download the model, so it will take some time
    let maxMs = 10_000
    while (!ready() && maxMs > 0) {
      await new Promise(r => window.setTimeout(r, 100))
      maxMs -= 100
    }
    if (maxMs <= 0) {
      onError?.(i18n.t('The QR scanner is not ready yet. Please try again.'))
      return stopScan
    }

    const { useIntervalFn } = await import('@vueuse/core')

    const { resume, pause } = useIntervalFn(() => scanFrame(video!, scan), 300, { immediate: true })
    stopScan = pause
    resumeScan = resume

    return stopScan
  }

  return {
    startScan,
  }
}

function useQRScannerMobile({ parseString }: UseQRScannerDeviceOptions) {
  async function startScan(_options: StartScannerOptions) {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
    await BarcodeScanner.addListener('barcodeScanned', ({ barcode }) => parseString(barcode.displayValue))
    await BarcodeScanner.startScan()

    return async function stopScan() {
      await BarcodeScanner.removeAllListeners()
      await BarcodeScanner.stopScan()
    }
  }

  return {
    startScan,
  }
}
