<script setup lang="ts">
import { Clipboard } from '@capacitor/clipboard'
import { IonRippleEffect } from '@ionic/vue'
import { computed } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'

const props = defineProps({
  address: {
    type: String,
    required: true,
  },
  format: {
    type: String as () => 'nimiq' | 'ethereum',
    default: 'nimiq',
  },
  isCopyable: {
    type: Boolean,
    default: true,
  },
})

const logger = useLogger('AddressDisplay')
const { setToast } = useToast()

const chunks = computed(() => {
  switch (props.format) {
    case 'ethereum':
      if (!props.address)
        return Array.from({ length: 3 }).fill('-') as string[]
      return props.address.replace(/[+ ]/g, '').match(/.{14}/g)!
    case 'nimiq':
    default:
      if (!props.address)
        return Array.from({ length: 9 }).fill('-') as string[]
      return props.address.replace(/[+ ]/g, '').match(/.{4}/g)!
  }
})

const isNimiq = computed(() => props.format === 'nimiq')

async function handleCopy() {
  if (!props.isCopyable)
    return
  try {
    await Clipboard.write({
      string: props.address,
    })
    await setToast({ message: i18n.t('Address copied to clipboard') })
  }
  catch (error) {
    logger.error('Failed to copy address to clipboard', error)
    await setToast({ message: i18n.t('Failed to copy address to clipboard') })
  }
}
</script>

<template>
  <div class="relative overflow-hidden text-2xl rounded-md text-space bg-space/5 address-display ion-activatable ripple-parent" :class="`format-${format}`" @click="handleCopy">
    <span v-for="(chunk, index) in chunks" :key="chunk + index" class="chunk">{{ chunk }}<span v-if="isNimiq" class="space">&nbsp;</span></span>
    <IonRippleEffect />
  </div>
</template>

<style scoped>
.address-display {
  box-sizing: content-box;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  font-weight: 500;
  padding: 6px 10px;
}

.chunk {
  font-family: 'Fira Mono', monospace;
  margin: 0.6rem 0;
  line-height: 1.11;
  text-align: center;
  box-sizing: border-box;
}

.format-nimiq .chunk {
  width: 33%;
  text-transform: uppercase;
}

.space {
  font-size: 0;
}
</style>
