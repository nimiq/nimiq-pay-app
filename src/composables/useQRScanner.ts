import { BarcodeScanner } from '@sisou/capacitor-barcode-scanner'
import type { MaybeRef } from 'vue'
import { onBeforeUnmount, ref, toValue } from 'vue'
import type { PaymentRequestData } from '@/types/steps'
import { Rail, ShopCategory } from '@/types/transactions'
import { nimAddressRegex, nimCashlinkRegex } from '@/lib'

export enum QRScannerDataFormat {
  NimiqAddress = 'nimiqAddress',
  PaymentRequest = 'paymentRequest',
  NimCashlink = 'nimCashlink',
}

interface UseQRScannerOptions<T = QRScannerDataFormat> {
  // The type of data we expect to scan
  expect: T

  // Callback function to handle the scanned data
  onScan: (
    data: T extends QRScannerDataFormat.PaymentRequest ? PaymentRequestData : string
  ) => void

  // DOM element where the camera will be attached
  target?: MaybeRef<HTMLElement | undefined>
}

export function useQRScanner({ onScan, expect, target }: UseQRScannerOptions) {
  const isDev = import.meta.env.DEV

  const isScanning = ref(false)
  const error = ref('')

  const stopScan = async () => {
    await BarcodeScanner.showBackground()
    await BarcodeScanner.stopScan()
    isScanning.value = false
    document.body.classList.remove('scanner-active')
  }

  // Parses different URL formats and puts the data in a PaymentRequestData object
  //    Nimiq links: https://github.com/nimiq/nimiq-utils/blob/0b1cf9123c8f2218255eefdf48407fe14f5e8873/src/request-link-encoding/RequestLinkEncoding.ts#L217
  //    GoCrypto: TODO
  //    Bluecode: TODO
  async function parsePaymentRequest(content: string) {
    if (expect !== QRScannerDataFormat.PaymentRequest)
      return

    const url = new URL(content)

    // eslint-disable-next-line no-console
    console.log(`📷  QR data: ${url.href}`)

    const searchParams = new URLSearchParams(url.search)
    const recipient = url.pathname
    const amount = Math.round(Number.parseFloat(searchParams.get('amount') || '0') * 100000)
    if (!amount || !recipient)
      return

    // There is no fee in nimiq:... links
    const fee = 0

    // At the moment, we don't have a way of fetching the shop category from the Crypto Map
    const shopCategory = ShopCategory.Shop

    const message = searchParams.get('message') || undefined
    const shopName = searchParams.get('label') || undefined

    let data: PaymentRequestData
    if (searchParams.has(Rail.GoCrypto))
      data = { recipient, amount, message, fee, shopName, shopCategory, rail: Rail.GoCrypto, railPeerId: searchParams.get(Rail.GoCrypto)! }
    else if (searchParams.has(Rail.CryptoPaymentLink))
      data = { recipient, amount, message, fee, shopName, shopCategory, rail: Rail.CryptoPaymentLink, railPeerId: searchParams.get(Rail.CryptoPaymentLink)! }
    else
      // This is a fallback. We found the amount and the recipient, but we don't know the rail.
      data = { recipient, amount, message, fee, shopName, shopCategory }

    setTimeout(stopScan, 500)
    onScan(data)
    isScanning.value = false
  }

  async function parseNimAddress(content: string) {
    if (expect !== QRScannerDataFormat.NimiqAddress)
      return

    if (!nimAddressRegex.test(content))
      return

    setTimeout(stopScan, 500)
    onScan(content)
    isScanning.value = false
  }

  async function parseCashlink(cashlink: string) {
    if (expect !== QRScannerDataFormat.NimCashlink)
      return

    if (!nimCashlinkRegex.test(cashlink))
      return

    setTimeout(stopScan, 500)
    onScan(cashlink)
    isScanning.value = false
  }

  async function startScan() {
    relocateVideo()
    await BarcodeScanner.prepare({ cameraDirection: 'back' })
    await BarcodeScanner.checkPermission({ force: true })
    await BarcodeScanner.hideBackground()
    await BarcodeScanner.resumeScanning()
    document.body.classList.add('scanner-active')

    isScanning.value = true

    // eslint-disable-next-line no-console
    console.log('📷  Scanning QR code')

    while (isScanning.value) {
      const { content, hasContent, err } = await BarcodeScanner.startScan({ cameraDirection: 'back' })
        .then(r => ({ ...r, err: '' })).catch(err => ({ content: '', hasContent: false, err: err.message }))
      if (err) { error.value = err; return }
      if (!hasContent)
        continue
      switch (expect) {
        case QRScannerDataFormat.NimiqAddress:
          parseNimAddress(content)
          break
        case QRScannerDataFormat.PaymentRequest:
          parsePaymentRequest(content)
          break
        case QRScannerDataFormat.NimCashlink:
          parseCashlink(content)
          break
      }
    }
  }

  function setDummyData() {
    if (!isDev)
      return
    switch (expect) {
      case QRScannerDataFormat.NimCashlink:
        // eslint-disable-next-line no-alert
        alert('Not implemented yet')
        break
      case QRScannerDataFormat.NimiqAddress:
        parseNimAddress('NQ89J7V7PFEYJNB1CVKUA32GJQN9U1BATSE4')
        break
      case QRScannerDataFormat.PaymentRequest:
        parsePaymentRequest('nimiq:NQ89J7V7PFEYJNB1CVKUA32GJQN9U1BATSE4?amount=7&message=Ref%20%2375VZ&label=Test%20Store&cpl_id=75VZloGY')
        break
    }
  }

  const defaultVideoContainerStyles = 'position:absolute; top: 0; left: 0; width:100%; height: 100%; background-color: black;'
  /**
   * This function sets up a MutationObserver to watch for changes in the DOM.
   * When the scanner is mounted, it is mounted at the end of the body with an
   * absolute position and covering the whole screen.
   * We just watch the body for changes, and when the scanner is mounted, a
   * specific element (a div with a video and a certain style) is added to the body,
   * it modifies the video's style, moves the video to a different container, and hides the original element.
   */
  function relocateVideo() {
    if (!toValue(target))
      return
    const observer = new MutationObserver(() => {
      const element = document.body.querySelector(`[style="${defaultVideoContainerStyles}"]`) as HTMLDivElement
      if (!element)
        return
      observer.disconnect()
      const video = element.querySelector('video')
      video!.style!.objectFit = 'cover'
      toValue(target)?.appendChild(video!)
      // remove element from DOM
      element.remove()
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }

  onBeforeUnmount(stopScan)

  return {
    isScanning,
    startScan,
    stopScan,
    error,
    nimAddressRegex,

    setDummyData,
  }
}
