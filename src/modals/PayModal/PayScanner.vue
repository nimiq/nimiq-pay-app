<script setup lang="ts">
import { inject, markRaw, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { IonFooter, IonToolbar } from '@ionic/vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { BarcodeScanner } from '@sisou/capacitor-barcode-scanner'
import PayConfirm from './PayConfirm.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'

const isDev = import.meta.env.DEV

const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const nav = (document.querySelector('[data-pay-nav]')) as Nav & HTMLElement
const isScanning = ref(false)
const cameraDirection = ref<'back' | 'front'>('back')

async function handleSkip() {
  if (isDev) {
    console.log('Skipping QR code scan')
    await stopScan()
    await instantPayWallet.preparePayment({
      address: Nimiq.Address.fromString('NQ89 J7V7 PFEY JNB1 CVKU A32G JQN9 U1BA TSE4'),
      amount: Nimiq.Policy.coinsToLunas(7),
      message: 'Ref #75VZ',
      label: 'Test Store',
      rail: 'CPL',
      railId: '75VZloGY',
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
    const result = await BarcodeScanner.startScan({
      cameraDirection: cameraDirection.value,
      targetedFormats: ['QR_CODE'],
    })
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
        rail = 'CPL'
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
  navigateToPayConfirm()
}

async function stopScan() {
  document.body.classList.remove('scanner-active')
  await BarcodeScanner.showBackground()
  await BarcodeScanner.stopScan()
  isScanning.value = false
}

watch(cameraDirection, async () => {
  await BarcodeScanner.stopScan()
  startScan()
})

function navigateToPayConfirm() {
  nav.push(markRaw(PayConfirm))
}

onMounted(async () => {
  isDev && console.log('Preparing barcode scanner')
  await BarcodeScanner.prepare({ cameraDirection: cameraDirection.value })
  setTimeout(() => startScan(), 500)
})
onBeforeUnmount(stopScan)
onDeactivated(stopScan)
</script>

<template>
  <ModalTemplate>
    <template #title><span class="relative z-10">Scan QR code</span></template>
    <template #subtitle>
      <span v-if="isDev" class="relative z-10 text-sm font-normal text-blue-300" @click="handleSkip">Click here to use mockup</span>
    </template>
    <div class="flex flex-col items-center justify-between w-full h-full">
      <div class="relative w-[80vw] bg-gray-100 h-[80vw] transition-all border-corner" :class="{ '!bg-transparent outline outline-white outline-[100vh]': isScanning }">
        <span class="border_bottom" />
      </div>
      <ion-button v-if="cameraDirection === 'back'" class="h-0 my-8 text-white" @click="cameraDirection = 'front'">Camera: back</ion-button>
      <ion-button v-if="cameraDirection === 'front'" class="h-0 my-8 text-white" @click="cameraDirection = 'back'">Camera: front</ion-button>
    </div>
  </ModalTemplate>
  <IonFooter>
    <IonToolbar>
      <div class="p-[0.15rem] mx-auto font-bold w-fit rounded-[100px] bg-space-space-200 border">
        <button class="py-4 text-white uppercase px-7 rounded-[100px]" style="background: var(--radial-gradient-light-blue);">
          Scan QR
        </button>
        <!--
          <button class="py-4 text-space/30 uppercase px-7 rounded-[100px]">
          Bluecode
        </button>
        -->
      </div>
    </IonToolbar>
  </IonFooter>
</template>

<style scoped>
ion-footer > ion-toolbar {
  --background: white;
  --padding-top: 8px;
  --padding-bottom: 8px;
  box-shadow: 0px 0px 4.12454px 0px rgba(31, 35, 72, 0.03), 0px 0px 12.51868px 0px rgba(31, 35, 72, 0.05), 0px 0px 32.00036px 0px rgba(31, 35, 72, 0.06), 0px 0px 80px 0px rgba(31, 35, 72, 0.07);
}
.footer-md {
  box-shadow: none !important;
}

.border-corner:before {
  	display: block;
  	content: "";
  	width: 35px;
  	height: 35px;
  	position: absolute;
  	top: -1px;
  	left: -1px;
  	border-top: 2px solid var(--colors-darkblue);
  	border-left: 2px solid var(--colors-darkblue);
  }

  .border-corner:after {
  	display: block;
  	content: "";
  	width: 35px;
  	height: 35px;
  	position: absolute;
  	top: -1px;
  	right: -1px;
  	border-top: 2px solid var(--colors-darkblue);
  	border-right: 2px solid var(--colors-darkblue);
  }

  .border-corner span.border_bottom:before {
  	display: block;
  	content: "";
  	width: 35px;
  	height: 35px;
  	position: absolute;
  	bottom: -1px;
  	left: -1px;
  	border-bottom: 2px solid var(--colors-darkblue);
  	border-left: 2px solid var(--colors-darkblue);
  }

  .border-corner span.border_bottom:after {
  	display: block;
  	content: "";
  	width: 35px;
  	height: 35px;
  	position: absolute;
  	bottom: -1px;
  	right: -1px;
  	border-bottom: 2px solid var(--colors-darkblue);
  	border-right: 2px solid var(--colors-darkblue);
  }
</style>
