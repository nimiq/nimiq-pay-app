import type { scan as Scan } from 'qr-scanner-wechat'
import type { Ref } from 'vue'
import { ref } from 'vue'
import { useThrottleFn } from '@vueuse/core'
import { useDevice } from './useDevice'
import { QRDataFormat } from './useStringParser'
import { useCameraFeed } from './useCameraFeed'
import { useStringParser } from './useStringParser'
import { i18n } from '@/i18n/i18n-setup'
import type { PaymentRequestData } from '@/lib/flows/steps.types'

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
  const { setUpCameraFeed, tearDownCameraFeed, hasPermission } = useCameraFeed(cameraFeedContainer)
  const { startScan, stopScan } = (useDevice().isWeb ? useQRScannerWeb : useQRScannerMobile)({ parseString, onError })
  const state = ref(QRScannerState.Idle)

  async function start() {
    const video = await setUpCameraFeed()
    if (!hasPermission.value) {
      state.value = QRScannerState.NoPermission
      return
    }
    startScan({ video })
    state.value = QRScannerState.Scanning
  }

  async function stop() {
    await tearDownCameraFeed()
    stopScan()
    state.value = QRScannerState.Idle
  }

  // setDummyData is only used in development mode to test the scanner. In production, it will be a no-op function.
  let setDummyData = () => { }
  if (import.meta.env.DEV) {
    setDummyData = () => {
      const dummyData = {
        [QRDataFormat.NimiqAddress]: 'NQ23UAHEYH2K7B9KS9E6A0HFXA5H8H8SDQ7L',
        [QRDataFormat.PaymentRequest]: 'nimiq:NQ89J7V7PFEYJNB1CVKUA32GJQN9U1BATSE4?amount=10&message=Ref%20%23f5z0&label=Alberto%20test&cpl_id=f5z0LYdA',
        [QRDataFormat.NimCashlink]: 'NOT_IMPLEMENTED___IT_WILL_RAISE_AN_ERROR',
      }[expect]
      parseString(dummyData)
    }
  }

  async function parseString(raw: string) {
    const { getCashlink, getNimAddress, getPaymentRequestData } = useStringParser()
    if (expect === QRDataFormat.NimiqAddress) { return getNimAddress(raw) }
    else if (expect === QRDataFormat.PaymentRequest) {
      const { data, error } = getPaymentRequestData(raw)
      if (error || !data)
        return { error, data: undefined }
      onData(data)
    }
    else if (expect === QRDataFormat.NimCashlink) { return getCashlink(raw) }
    // No translation as not user-facing. It's a dev error, which shouldn't occur in production.
    else { return { error: `Invalid QRDataFormat. Use any of ${Object.values(QRDataFormat)}`, data: undefined } }
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
  let stopScan: Function = () => { } // We need to initialize this function to avoid TS errors
  let resumeScan: Function

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

  async function startScan({ video }: StartScannerOptions) {
    if (resumeScan) {
      resumeScan()
      return
    }

    const { ready, scan } = await import('qr-scanner-wechat')

    // The first time, we need to download the model, so it will take some time
    let maxMs = 10_000
    while (!ready() && maxMs > 0) {
      await new Promise(r => setTimeout(r, 100))
      maxMs -= 100
    }
    if (maxMs <= 0) {
      onError?.(i18n.t('The QR scanner is not ready yet. Please try again.'))
      return
    }

    const { useIntervalFn } = await import('@vueuse/core')

    const { resume, pause } = useIntervalFn(() => scanFrame(video!, scan), 300, { immediate: false })
    stopScan = pause
    resumeScan = resume
  }

  return {
    startScan,
    stopScan,
  }
}

function useQRScannerMobile({ parseString }: UseQRScannerDeviceOptions) {
  async function startScan(_options: StartScannerOptions) {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
    await BarcodeScanner.addListener('barcodeScanned', useThrottleFn(async ({ barcode }) => {
      // eslint-disable-next-line no-console
      console.log('barcodeScanned', barcode)
      const { error } = await parseString(barcode.displayValue)
      if (error)
        console.error(error)
    }, 1000))
    await BarcodeScanner.startScan()
  }

  async function stopScan() {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
    await BarcodeScanner.removeAllListeners()
    await BarcodeScanner.stopScan()
  }

  return {
    startScan,
    stopScan,
  }
}
