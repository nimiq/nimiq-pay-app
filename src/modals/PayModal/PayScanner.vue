<script setup lang="ts">
import { inject, markRaw, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { IonFooter, IonToolbar } from '@ionic/vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
import PayConfirm from './PayConfirm.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'

const isDev = import.meta.env.DEV

const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const nav = (document.querySelector('[data-pay-nav]')) as Nav & HTMLElement
const isScanning = ref(false)

async function handleSkip() {
  if (isDev) {
    console.log('Skipping QR code scan')
    await stopScan()
    await instantPayWallet.preparePayment({
      address: Nimiq.Address.fromString('NQ07 0000 0000 0000 0000 0000 0000 0000 0000'),
      amount: Nimiq.Policy.coinsToLunas(1),
      message: 'Ref #123456789',
      label: 'Test Store',
      rail: 'cpl',
      railId: undefined,
    })
    navigateToPayConfirm()
  }
}

async function startScan() {
  await BarcodeScanner.checkPermission({ force: true })
  await BarcodeScanner.hideBackground()
  isScanning.value = true
  document.body.classList.add('scanner-active')
  while (true) {
    isDev && console.log('Scanning QR code')
    const result = await BarcodeScanner.startScan()
    if (!result.hasContent)
      continue
    if (!result.content.startsWith('nimiq:'))
      continue
    try {
      const url = new URL(result.content)
      const address = Nimiq.Address.fromString(url.pathname)
      const searchParams = new URLSearchParams(url.search)
      const amountString = searchParams.get('amount')
      if (amountString == null)
        continue
      const amount = Math.round(Number.parseFloat(amountString) * 100000)
      const message = searchParams.get('message')
      const label = searchParams.get('label')
      const gocrypto_id = searchParams.get('gocrypto_id')
      const cpl_id = searchParams.get('cpl_id')
      let rail, railId
      if (gocrypto_id != null) {
        rail = 'gocrypto'
        railId = gocrypto_id
      }
      else if (message !== null && (message.startsWith('Ref #') && label !== null || cpl_id !== null)) {
        rail = 'cpl'
        railId = cpl_id || undefined
      }
      await instantPayWallet.preparePayment({ address, amount, message, label, rail, railId })
      break
    }
    catch (e) {
      console.log(e)
    }
  }
  await stopScan()
  isScanning.value = false
  navigateToPayConfirm()
}

async function stopScan() {
  document.body.classList.remove('scanner-active')
  await BarcodeScanner.showBackground()
  await BarcodeScanner.stopScan()
}

function navigateToPayConfirm() {
  nav.push(markRaw(PayConfirm))
}

onMounted(async () => {
  isDev && console.log('Preparing barcode scanner')
  await BarcodeScanner.prepare()
  setTimeout(() => startScan(), 500)
})
onBeforeUnmount(stopScan)
onDeactivated(stopScan)
</script>

<template>
  <ModalTemplate>
    <div class="relative w-full h-3/4">
      <div class="rounded-lg w-[80vw] bg-blue-100 h-[80vw] transition-all" :class="{ 'bg-transparent border-2 border-blue-600 outline outline-white outline-[100vh]': isScanning }" />
      <p class="absolute mt-16 text-xl font-semibold -translate-x-1/2 left-1/2" @click="handleSkip">
        Scan QR code
        <span v-if="isDev" class="block text-sm font-normal text-blue-300">Click here to use mockup</span>
      </p>
    </div>
  </ModalTemplate>
  <IonFooter>
    <IonToolbar>
      <div class="p-[0.15rem] mx-auto font-medium bg-blue-100 border-2 border-blue-600 rounded-lg w-fit">
        <button class="px-6 py-2 text-white bg-blue-600 rounded-lg">
          Scan QR
        </button>
        <!--
        <button class="px-6 py-2 text-blue-600 rounded-lg">
          Bluecode
        </button>
        -->
      </div>
    </IonToolbar>
  </IonFooter>
</template>

<style scoped>
ion-footer > ion-toolbar {
  --border-color: rgb(59 130 246);
  --border-width: 1px 0 0 0;
  --padding-bottom: 0.5rem;
  --padding-top: 0.5rem;
  --border-style: solid;
}

.footer-md {
  box-shadow: none !important;
}
</style>
