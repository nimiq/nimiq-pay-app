<script setup lang="ts">
// TODO: refactor with PayScanner into one file
import { inject, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
import { Modal, useModal } from '@/composables/useModal'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { NimiqWallet } from '@/lib/nimiq-wallet'

const isDev = import.meta.env.DEV

const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet
const { showModal, showNotificationAlert, closeAllModals } = useModal()
const isScanning = ref(false)

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
    try {
      await claimCashlink(result.content)
      break
    }
    catch (e) {
      console.log(e)
    }
  }
  await stopScan()
  isScanning.value = false
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
}

function handleClose() {
  showModal(Modal.NimTransfer, { isFullscreen: true })
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
  <ModalTemplate :on-closing="handleClose">
    <div class="relative w-full h-full">
      <p class="absolute top-0 z-10 text-2xl font-bold -translate-x-1/2 left-1/2">
        Scan Cashlink
      </p>
      <div
        class="absolute -translate-x-1/2 left-1/2 top-1/3 -translate-y-1/3 w-[80vw] bg-gray-100 h-[80vw] transition-all border-corner"
        :class="{ '!bg-transparent outline outline-white outline-[100vh]': isScanning }"
      >
        <span class="border_bottom" />
      </div>
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
