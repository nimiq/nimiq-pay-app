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

interface QRData {
  address: Nimiq.Address
  amount: number
  message?: string
  label?: string
  rail?: string
  railId?: string
}

export function useQRScanner() {
  const isDev = import.meta.env.DEV

  const isScanning = ref(false)
  const data = ref<QRData>()

  function parseData(url: URL) {
    const searchParams = new URLSearchParams(url.search)
    const address = Nimiq.Address.fromString(url.pathname)
    const amount = Math.round(Number.parseFloat(searchParams.get('amount') || '0') * 100000)
    if (!amount || !address)
      return

    const message = searchParams.get('message') || undefined
    const label = searchParams.get('label') || undefined

    const gocryptoId = searchParams.get('gocrypto_id') || undefined
    const cplId = searchParams.get('cpl_id') || undefined
    let providerInfo: Pick<QRData, 'rail' | 'railId'> = {}

    if (gocryptoId)
      providerInfo = { rail: 'gocrypto', railId: gocryptoId }
    else if (message && message.startsWith('Ref #') && label || cplId)
      providerInfo = { rail: 'CPL', railId: cplId }

    data.value = { address, amount, message, label, ...providerInfo }
  }

  const stopScan = async () => {
    await BarcodeScanner.showBackground()
    isScanning.value = false
    document.body.classList.remove('scanner-active')
  }

  async function startScan() {
    await BarcodeScanner.checkPermission({ force: true })
    await BarcodeScanner.hideBackground()
    document.body.classList.add('scanner-active')

    isScanning.value = true

    while (!data.value) {
      if (isDev)
        // eslint-disable-next-line no-console
        console.log('📷  Scanning QR code')

      const result = await BarcodeScanner.startScan({ cameraDirection: 'back' })
      if (!result.hasContent || !result.content.startsWith('nimiq:'))
        continue

      try { parseData(new URL(result.content)) }
      // eslint-disable-next-line no-console
      catch (e) { console.log(e) }
      // await instantPayWallet.preparePayment({ address, amount, message, label, rail, railId })
    }

    await stopScan()
  }

  function setDummyData() {
    if (!isDev)
      return

    // eslint-disable-next-line no-console
    console.log('📷  Setting dummy data')

    data.value = {
      address: Nimiq.Address.fromString('NQ89 J7V7 PFEY JNB1 CVKU A32G JQN9 U1BA TSE4'),
      amount: Nimiq.Policy.coinsToLunas(7),
      message: 'Ref #75VZ',
      label: 'Test Store',
      rail: 'CPL',
      railId: '75VZloGY',
    }
    stopScan()
  }

  function reset() {
    data.value = undefined
  }

  onMounted(async () => {
    if (isDev)
      // eslint-disable-next-line no-console
      console.log('📷  Preparing barcode scanner')

    await BarcodeScanner.prepare({ cameraDirection: 'back' })
    setTimeout(startScan, 500)
  })

  onBeforeUnmount(stopScan)

  return {
    isScanning,
    startScan,
    stopScan,
    reset,

    setDummyData,
  }
}
