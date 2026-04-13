<script setup lang="ts">
import { Identicon } from '@nimiq/vue3-components'
import { computed } from 'vue'
import IconHorizontalEllipsis from '@/components/icons/horizontal-ellipsis.vue'
import UsdtLogo from '@/components/icons/usdt-logo.vue'

const props = defineProps({
  address: { type: String, required: true },
  identiconWidth: { type: String, default: 'w-10' },
  hideIdenticon: { type: Boolean, default: false },
})

const isNimiq = computed(() => props.address.startsWith('NQ'))
const isPolygonUsdtAddress = computed(() => props.address.startsWith('0x'))
const sliceLength = computed(() => isNimiq.value ? 4 : 6)
const showNimiqIdenticon = computed(() => !props.hideIdenticon && isNimiq.value)
const showUsdtLogo = computed(() => !props.hideIdenticon && isPolygonUsdtAddress.value)
const usdtLogoWidth = computed(() => props.identiconWidth === 'w-10' ? 'w-8' : props.identiconWidth)
</script>

<template>
  <div class="flex items-center gap-x-4">
    <Identicon v-if="showNimiqIdenticon" :address="address" :class="identiconWidth" />
    <UsdtLogo v-else-if="showUsdtLogo" :class="usdtLogoWidth" />
    <div class="address flex items-center gap-x-2" :class="{ uppercase: isNimiq }">
      <span>{{ address.slice(0, sliceLength) }}</span>
      <IconHorizontalEllipsis class="w-6 text-space/30" />
      <span>{{ address.slice(-sliceLength) }}</span>
    </div>
  </div>
</template>

<style scoped>
.address {
  font-family: 'Fira Mono', monospace;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: .2px;
}
</style>
