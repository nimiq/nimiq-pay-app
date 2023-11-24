// async function startScan() {
//   await BarcodeScanner.checkPermission({ force: true })
//   await BarcodeScanner.hideBackground()
//   isScanning.value = true
//   document.body.classList.add('scanner-active')
//   while (true) {
//     isDev && console.log('Scanning QR code')
//     const result = await BarcodeScanner.startScan({ cameraDirection: 'back' })
//     if (!result.hasContent)
//       continue
//     if (!result.content.startsWith('nimiq:'))
//       continue
//     try {
//       const url = new URL(result.content)
//       const address = Nimiq.Address.fromString(url.pathname)
//       const searchParams = new URLSearchParams(url.search)
//       const amountString = searchParams.get('amount')
//       if (amountString == null)
//         continue
//       const amount = Math.round(Number.parseFloat(amountString) * 100000)
//       const message = searchParams.get('message')
//       const label = searchParams.get('label')
//       const gocrypto_id = searchParams.get('gocrypto_id')
//       const cpl_id = searchParams.get('cpl_id')
//       let rail, railId
//       if (gocrypto_id != null) {
//         rail = 'gocrypto'
//         railId = gocrypto_id
//       }
//       else if (message !== null && (message.startsWith('Ref #') && label !== null || cpl_id !== null)) {
//         rail = 'CPL'
//         railId = cpl_id || undefined
//       }
//       await instantPayWallet.preparePayment({ address, amount, message, label, rail, railId })
//       break
//     }
//     catch (e) {
//       console.log(e)
//     }
//   }
import { BarcodeScanner } from '@sisou/capacitor-barcode-scanner'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { PaymentRequestData } from '@/types/steps'
import { Rail } from '@/types/transactions'

interface UseQRScannerOptions {
  onScan: (data: PaymentRequestData) => void
}

export function useQRScanner({ onScan }: UseQRScannerOptions) {
  const isDev = import.meta.env.DEV

  const isScanning = ref(false)

  const stopScan = async () => {
    await BarcodeScanner.showBackground()
    isScanning.value = false
    document.body.classList.remove('scanner-active')
  }

  async function parseData(url: URL) {
    // eslint-disable-next-line no-console
    console.log(`📷  Setting data from QR: ${url.href}`)

    const searchParams = new URLSearchParams(url.search)
    const recipient = url.pathname
    const amount = Math.round(Number.parseFloat(searchParams.get('amount') || '0') * 100000)
    if (!amount || !recipient)
      return

    const fee = 0

    const message = searchParams.get('message') || undefined
    const label = searchParams.get('label') || undefined

    let data: PaymentRequestData
    if (searchParams.has(Rail.GoCrypto))
      data = { recipient, amount, message, fee, locationName: label, rail: Rail.GoCrypto, railPeerId: searchParams.get(Rail.GoCrypto)! }
    else if (searchParams.has(Rail.CryptoPaymentLink))
      data = { recipient, amount, message, fee, locationName: label, rail: Rail.CryptoPaymentLink, railPeerId: searchParams.get(Rail.CryptoPaymentLink)! }
    else
      // This is a fallback. We found the amount and the recipient, but we don't know the rail.
      data = { recipient, amount, message, fee, locationName: label }

    onScan?.(data)
    isScanning.value = false
    await stopScan()
  }

  async function startScan() {
    await BarcodeScanner.checkPermission({ force: true })
    await BarcodeScanner.hideBackground()
    document.body.classList.add('scanner-active')

    isScanning.value = true

    // eslint-disable-next-line no-console
    console.log('📷  Scanning QR code')
    while (isScanning.value) {
      const result = await BarcodeScanner.startScan({ cameraDirection: 'back' })
      if (!result.hasContent || !result.content.startsWith('nimiq:'))
        continue

      try { parseData(new URL(result.content)) }
      // eslint-disable-next-line no-console
      catch (e) { console.log(e) }
      // await instantPayWallet.preparePayment({ address, amount, message, label, rail, railId })
    }
  }

  function setDummyData() {
    if (!isDev)
      return
    parseData(new URL('nimiq:NQ89J7V7PFEYJNB1CVKUA32GJQN9U1BATSE4?amount=7&message=Ref%20%2375VZ&label=Test%20Store&cpl_id=75VZloGY'))
  }

  onMounted(async () => {
    await BarcodeScanner.prepare({ cameraDirection: 'back' })
    setTimeout(startScan, 500)
  })

  onBeforeUnmount(stopScan)

  return {
    isScanning,
    startScan,
    stopScan,

    setDummyData,
  }
}
