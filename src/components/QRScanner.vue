<script setup lang="ts">
import type { PropType } from 'vue'
import { type State, stepEmits } from '@/types/steps'
import { useQRScanner } from '@/composables/useQRScanner'

defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
const emit = defineEmits(stepEmits)

const isDev = import.meta.env.DEV

const { isScanning, setDummyData } = useQRScanner({ onScan: data => emit('done', data) })
</script>

<template>
  <div class="flex flex-col self-start w-full h-full relative">
    <button v-if="isDev" class="block text-sm font-normal text-space/80 underline z-10" @click="setDummyData">
      Click here to use mockup data
    </button>
    <div class="absolute -translate-x-1/2 left-1/2 top-1/3 -translate-y-1/3 w-[80vw] bg-gray-100 h-[80vw] transition-all border-corner" :class="{ '!bg-transparent outline outline-white outline-[100vh]': isScanning }">
      <span class="border_bottom" />
    </div>
    <!-- <div class="flex flex-col justify-center mt-auto pb-6 w-full">
      <IonButton id="present-alert" size="small" class="text-base font-bold">
        Scan QR
      </IonButton>
    </div> -->
  </div>
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

.border-corner {
	&:before, &:after, & span.border_bottom::before, & span.border_bottom::after {
		display: block;
		content: "";
		width: 35px;
		height: 35px;
		position: absolute;
	}

	&:after {
		top: -1px;
		right: -1px;
		border-top: 2px solid var(--colors-darkblue);
		border-right: 2px solid var(--colors-darkblue);
	}

	&:before {
		bottom: -1px;
		left: -1px;
		border-bottom: 2px solid var(--colors-darkblue);
		border-left: 2px solid var(--colors-darkblue);
	}

	& span.border_bottom::after {
		top: -1px;
		left: -1px;
		border-top: 2px solid var(--colors-darkblue);
		border-left: 2px solid var(--colors-darkblue);
	}

	& span.border_bottom::before {
		bottom: -1px;
		right: -1px;
		border-bottom: 2px solid var(--colors-darkblue);
		border-right: 2px solid var(--colors-darkblue);
	}
}
</style>
