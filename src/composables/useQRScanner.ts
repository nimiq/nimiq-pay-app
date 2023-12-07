import type { MaybeRef } from 'vue'
import { computed, toValue } from 'vue'
import { ready, scan } from 'qr-scanner-wechat'
import { useIntervalFn } from '@vueuse/core'
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
  videoEl: MaybeRef<HTMLVideoElement>
}

export function useQRScanner({ onScan, expect, videoEl }: UseQRScannerOptions) {
  const video = computed(() => toValue(videoEl))

  const isDev = import.meta.env.DEV

  const { resume: resumeScan, pause: pauseScan, isActive: isScanning } = useIntervalFn(scanFrame, 100, { immediate: false })

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

    onScan(data)
    pauseScan()
  }

  async function parseNimAddress(content: string) {
    if (expect !== QRScannerDataFormat.NimiqAddress)
      return

    if (!nimAddressRegex.test(content))
      return

    onScan(content)
    pauseScan()
  }

  async function parseCashlink(cashlink: string) {
    if (expect !== QRScannerDataFormat.NimCashlink)
      return

    if (!nimCashlinkRegex.test(cashlink))
      return

    pauseScan()
    onScan(cashlink)
  }

  async function setupVideoStream() {
    if (!video.value)
      return

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: 512,
        height: 512,
        facingMode: 'environment', // Select the back camera
      },
    })

    video.value.srcObject = stream
    video.value.play()

    video.value.setAttribute('autoplay', 'true')
    video.value.setAttribute('muted', 'true')
    video.value.setAttribute('playsinline', 'true')
  }

  async function scanFrame() {
    const canvas = document.createElement('canvas')
    canvas.width = video.value.videoWidth
    canvas.height = video.value.videoHeight
    const ctx = canvas.getContext('2d')
    ctx!.drawImage(video.value, 0, 0, canvas.width, canvas.height)
    const { text: result } = await scan(canvas)

    if (!result)
      return

    if (expect === QRScannerDataFormat.NimCashlink)
      parseCashlink(result)
    else if (expect === QRScannerDataFormat.NimiqAddress)
      parseNimAddress(result)
    else if (expect === QRScannerDataFormat.PaymentRequest)
      parsePaymentRequest(result)
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

  async function startScan() {
    await setupVideoStream()
    resumeScan()
  }

  async function stopScan() {
    pauseScan()
    const mediaStream = video.value.srcObject as MediaStream
    mediaStream?.getTracks().forEach(track => track.stop())
    video.value.srcObject = null
  }

  return {
    ready,
    isScanning,
    startScan,
    stopScan,

    setDummyData,
  }
}
