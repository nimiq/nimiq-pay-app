import { BarcodeScanner } from '@sisou/capacitor-barcode-scanner'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { PaymentRequestData } from '@/types/steps'
import { Rail, ShopCategory } from '@/types/transactions'

interface UseQRScannerOptions {
  onScan: (data: PaymentRequestData) => void
}

export function useQRScanner({ onScan }: UseQRScannerOptions) {
  const isDev = import.meta.env.DEV

  const isScanning = ref(false)
  const error = ref('')

  const stopScan = async () => {
    await BarcodeScanner.showBackground()
    isScanning.value = false
    document.body.classList.remove('scanner-active')
  }

  // Parses different URL formats and puts the data in a PaymentRequestData object
  //    Nimiq links: https://github.com/nimiq/nimiq-utils/blob/0b1cf9123c8f2218255eefdf48407fe14f5e8873/src/request-link-encoding/RequestLinkEncoding.ts#L217
  //    GoCrypto: TODO
  //    Bluecode: TODO
  async function parsePaymentRequest(url: URL) {
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
    await stopScan()
    onScan(data)
    isScanning.value = false
  }

  async function startScan() {
    await BarcodeScanner.prepare({ cameraDirection: 'back' })
    await BarcodeScanner.checkPermission({ force: true })
    await BarcodeScanner.hideBackground()
    document.body.classList.add('scanner-active')

    isScanning.value = true

    // eslint-disable-next-line no-console
    console.log('📷  Scanning QR code')

    while (isScanning.value) {
      const { content, hasContent, err } = await BarcodeScanner.startScan({ cameraDirection: 'back' })
        .then(r => ({ ...r, err: '' })).catch(err => ({ content: '', hasContent: false, err: err.message }))
      if (err) { error.value = err; return }
      if (!hasContent || !content.startsWith('nimiq:'))
        continue
      parsePaymentRequest(new URL(content))
    }
  }

  function setDummyData() {
    if (!isDev)
      return
    parsePaymentRequest(new URL('nimiq:NQ89J7V7PFEYJNB1CVKUA32GJQN9U1BATSE4?amount=7&message=Ref%20%2375VZ&label=Test%20Store&cpl_id=75VZloGY'))
  }

  // Delay to wait for the modal to fully open
  onMounted(() => setTimeout(startScan, 500))
  onBeforeUnmount(stopScan)

  return {
    isScanning,
    startScan,
    stopScan,
    error,

    setDummyData,
  }
}
