<script setup lang="ts">
// TODO: refactor with PayScanner into one file
import { inject, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
import { ModalType, useModal } from '@/composables/useModal'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { NimiqWallet } from '@/lib/nimiq-wallet'

const isDev = import.meta.env.DEV

const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet
const { showModal, showNotificationAlert, closeAllModals } = useModal()
const isScanning = ref(false)
const cameraDirection = ref<'back' | 'front'>('back')

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
    try {
      await claimCashlink(result.content)
      break
    }
    catch (e) {
      console.log(e)
    }
  }
  await stopScan()
  closeAllModals()
}

async function claimCashlink(cashlink: string) {
  if (!cashlink)
    return null
  try {
    await nimiqWallet.claimCashlink(cashlink)
  }
  catch (e) {
    console.error('Error parsing Cashlink:', e)
    showNotificationAlert((e as Error).toString(), true)
    return null
  }
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

function handleClose() {
  showModal(ModalType.NimTransfer, { isFullscreen: true })
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
  <ModalTemplate :on-closing="handleClose">
    <template #title><span class="relative z-10">Scan Cashlink</span></template>
    <div class="w-full h-full flex flex-col items-center justify-between">
      <div></div>
      <div
        class="relative w-[80vw] bg-gray-100 h-[80vw] transition-all border-corner"
        :class="{ '!bg-transparent outline outline-white outline-[100vh]': isScanning }"
      >
        <span class="border_bottom" />
      </div>
      <ion-button v-if="cameraDirection === 'back'" class="text-white h-0 my-8" @click="cameraDirection = 'front'">Camera: back</ion-button>
      <ion-button v-if="cameraDirection === 'front'" class="text-white h-0 my-8" @click="cameraDirection = 'back'">Camera: front</ion-button>
    </div>
  </ModalTemplate>
</template>

<style scoped>
ion-footer>ion-toolbar {
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
