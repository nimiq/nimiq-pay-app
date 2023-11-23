<script setup lang="ts">
import { IonFooter, IonToolbar } from '@ionic/vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useQRScanner } from '@/composables/useQRScanner'

const isDev = import.meta.env.DEV

const { isScanning, reset, setDummyData } = useQRScanner()
</script>

<template>
  <ModalTemplate>
    <div class="relative w-full h-full">
      <p class="absolute top-0 z-10 text-2xl font-bold -translate-x-1/2 left-1/2" @click="setDummyData">
        Scan QR code
        <span v-if="isDev" class="block text-sm font-normal text-blue-300">Click here to use mockup</span>
      </p>
      <div class="absolute -translate-x-1/2 left-1/2 top-1/3 -translate-y-1/3 w-[80vw] bg-gray-100 h-[80vw] transition-all border-corner" :class="{ '!bg-transparent outline outline-white outline-[100vh]': isScanning }">
        <span class="border_bottom" />
      </div>
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
