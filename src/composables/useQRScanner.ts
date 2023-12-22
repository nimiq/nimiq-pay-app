import { ref } from 'vue'
import {
  type BarcodeScannedEvent,
  BarcodeScanner,
} from '@capacitor-mlkit/barcode-scanning'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import { QRScannerDataFormat, parseRawString } from '@/lib/qr-parsers'

interface UseQRScannerOptions<T = QRScannerDataFormat> {
  // The type of data we expect to scan
  expect: T
}

export function useQRScanner({ expect }: UseQRScannerOptions) {
  const isScanning = ref(false)
  type Data = typeof expect extends QRScannerDataFormat.PaymentRequest ? PaymentRequestData : string
  const data = ref<Data>()
  const error = ref<string>()

  function reset() {
    isScanning.value = false
    data.value = undefined
    error.value = undefined
  }

  async function onScan(result: BarcodeScannedEvent) {
    const { data: parsed, error: parsedError } = parseRawString(expect, result.barcode.displayValue)
    if (parsedError) {
      error.value = parsedError
      return
    }

    data.value = parsed as Data
    await stopScan()
  }

  async function stopScan() {
    await BarcodeScanner.removeAllListeners()
    await BarcodeScanner.stopScan()
    reset()
  }

  async function startScan() {
    reset()
    await BarcodeScanner.addListener('barcodeScanned', onScan)
    await BarcodeScanner.startScan()
    isScanning.value = true
  }

  // setDummyData is only used in development mode to test the scanner. In production, it will be a no-op function.
  let setDummyData = () => {}
  if (import.meta.env.DEV) {
    const dummyData = {
      [QRScannerDataFormat.NimiqAddress]: 'NQ23UAHEYH2K7B9KS9E6A0HFXA5H8H8SDQ7L',
      [QRScannerDataFormat.PaymentRequest]: 'nimiq:NQ89J7V7PFEYJNB1CVKUA32GJQN9U1BATSE4?amount=10&message=Ref%20%23f5z0&label=Alberto%20test&cpl_id=f5z0LYdA',
      [QRScannerDataFormat.NimCashlink]: 'NOT_IMPLEMENTED___IT_WILL_RAISE_AN_ERROR',
    }
    setDummyData = () => data.value = parseRawString(expect, dummyData[expect]).data! as Data
  }

  return {
    error,
    data,

    isScanning,
    startScan,
    stopScan,

    setDummyData,
  }
}
