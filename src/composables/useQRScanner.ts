import type { MaybeRef } from 'vue'
import { nextTick, ref, toValue } from 'vue'
import {
  type BarcodeScannedEvent,
  BarcodeScanner,
} from '@capacitor-mlkit/barcode-scanning'
import { modalController } from '@ionic/vue'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import { QRScannerDataFormat, parseRawString } from '@/lib/qr-parsers'

export type QRScannerData<T = QRScannerDataFormat> = T extends QRScannerDataFormat.PaymentRequest ? PaymentRequestData : string

interface UseQRScannerOptions<T = QRScannerDataFormat> {
  // The type of data we expect to scan
  expect: T

  onData?: (data: QRScannerData<T>) => any

  onError?: (error: string) => any

  // The element that will contain the camera feed
  cameraFeedContainer: MaybeRef<HTMLElement>
}

export function useQRScanner({ expect, cameraFeedContainer, onData, onError }: UseQRScannerOptions) {
  const isScanning = ref(false)
  const { setUpCameraFeed, tearDownCameraFeed } = useCameraFeed(cameraFeedContainer)

  function reset() {
    isScanning.value = false
  }

  async function onScan(result: BarcodeScannedEvent) {
    const { data: parsed, error: parsedError } = parseRawString(expect, result.barcode.displayValue)
    if (parsedError) {
      onError?.(parsedError)
      return
    }

    onData?.(parsed as any)
    await stopScan()
  }

  async function stopScan() {
    // eslint-disable-next-line no-console
    console.log('📷 Stopping scan')

    await tearDownCameraFeed()

    await BarcodeScanner.removeAllListeners()
    await BarcodeScanner.stopScan()
    reset()
  }

  async function startScan() {
    // eslint-disable-next-line no-console
    console.log('📷 Starting scan')

    await setUpCameraFeed()

    reset()
    await BarcodeScanner.addListener('barcodeScanned', onScan)
    await BarcodeScanner.startScan()
    isScanning.value = true
  }

  // setDummyData is only used in development mode to test the scanner. In production, it will be a no-op function.
  let setDummyData = () => { }
  if (import.meta.env.DEV) {
    const dummyData = {
      [QRScannerDataFormat.NimiqAddress]: 'NQ23UAHEYH2K7B9KS9E6A0HFXA5H8H8SDQ7L',
      [QRScannerDataFormat.PaymentRequest]: 'nimiq:NQ89J7V7PFEYJNB1CVKUA32GJQN9U1BATSE4?amount=10&message=Ref%20%23f5z0&label=Alberto%20test&cpl_id=f5z0LYdA',
      [QRScannerDataFormat.NimCashlink]: 'NOT_IMPLEMENTED___IT_WILL_RAISE_AN_ERROR',
    }
    setDummyData = () => onData?.(parseRawString(expect, dummyData[expect]).data! as any)
  }

  return {
    isScanning,
    startScan,
    stopScan,

    setDummyData,
  }
}

/**
 * In Ionic, the camera feed is displayed behind the WebView.
 * This composable will open a "hole" in the WebView to display the camera feed and close it when the camera is closed.
 *
 * @param cameraFeedContainer
 * @returns
 */
function useCameraFeed(cameraFeedContainer: MaybeRef<HTMLElement>) {
  // The important elements to manipulate. In the DOM they are nested like this:
  // <ion-app>
  //  <ion-modal> # modalWrapper - It is a WebComponent, which have a shadow root
  //    <ion-backdrop> # backdrop
  //    <div role="dialog"> # dialog
  const domElements = async () => ({
    mainView: document.querySelector('ion-app > div') as HTMLElement,
    dialog: await modalController.getTop().then(m => m?.shadowRoot?.querySelector('div[role="dialog"]') as HTMLElement),
    backdrop: await modalController.getTop().then(m => m?.shadowRoot?.querySelector('ion-backdrop') as HTMLElement),
  })

  const html = String.raw
  const cameraFeedHtml = html`
    <div style="position: absolute; inset: 0px; display: grid; place-content: center; width: 100%;">
    <div style="--px: 96px; position: relative; border: var(--px) solid white; border-top-width: calc(50vh - var(--px)); border-bottom-width: calc(50vh - var(--px));">
        <div style="width: calc(100vw - var(--px)); aspect-ratio: 1 / 1;">
        <svg style="position: absolute; inset: -2px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 232 232">
          <path stroke="#1F2348" stroke-width="2" d="M1 21V1M0 1h20M211 1h20M231 0v20M231 211v20M232 231h-20M21 230H1M1 231v-20" />
        </svg>
      </div>
    </div>
  `

  /**
   * The camera feed is displayed behind the WebView. This function will open a "hole" in the WebView to display the camera feed.
   * First, we make a hole in the Modal and then we make the main view invisible.
   * To fake the modal, we create an huge white outline around the hole and make the element inside transparent.
   */
  async function setUpCameraFeed() {
    const { mainView, dialog, backdrop } = await domElements()

    if (!mainView || !toValue(cameraFeedContainer) || !dialog || !backdrop)
      throw new Error(`There is an element missing: ${JSON.stringify({ mainView, cameraFeedContainer, dialog, backdrop })}`)

    // modalController.getTop()?.presentingElement?.style.setProperty('--background', 'transparent')
    mainView.style.setProperty('display', 'none')
    backdrop.style.setProperty('display', 'none')
    dialog.style.setProperty('--background', 'transparent')
    dialog.style.setProperty('border-top', 'calc((var(--ion-safe-area-top) + 10px)) solid #a9a9a9')
    toValue(cameraFeedContainer).innerHTML = cameraFeedHtml
  }

  async function tearDownCameraFeed() {
    const { mainView, dialog, backdrop } = await domElements()
    if (!mainView || !dialog || !backdrop)
      throw new Error(`There is an element missing: ${JSON.stringify({ mainView, cameraFeedContainer, dialog, backdrop })}`)

    mainView.style.removeProperty('display')
    backdrop.style.removeProperty('display')
    dialog.style.removeProperty('--background')
    dialog.style.removeProperty('border-top')
    toValue(cameraFeedContainer).innerHTML = ''
  }

  return {
    setUpCameraFeed,
    tearDownCameraFeed,
  }
}
