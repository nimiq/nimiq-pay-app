<script setup lang="ts">
import { IonRippleEffect, toastController } from '@ionic/vue'
import { computed } from 'vue'
import { Clipboard } from '@capacitor/clipboard'

const props = defineProps({
  address: {
    type: String,
    required: true,
  },
  isCopyable: {
    type: Boolean,
    default: true,
  },
})

const chunks = computed(() => {
  if (!props.address)
    return Array.from({ length: 9 }).fill('-') as string[]
  return props.address.replace(/[+ ]/g, '').match(/.{4}/g)!
})

async function handleCopy() {
  if (!props.isCopyable)
    return
  await Clipboard.write({
    string: props.address,
  })
  await toastController.create({
    message: 'Address copied to clipboard',
    duration: 1500,
    position: 'bottom',
  })
}
</script>

<template>
  <div class="relative overflow-hidden text-2xl rounded text-space/50 address-display ion-activatable ripple-parent" @click="handleCopy">
    <span v-for="(chunk, index) in chunks" :key="chunk + index" class="chunk">{{ chunk }}<span class="space">&nbsp;</span></span>
    <IonRippleEffect />
  </div>
</template>

<style scoped>
.address-display {
  box-sizing: content-box;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  max-width: 28.25rem;
  font-weight: 400;
  padding: 0.25rem;
}

.chunk {
  font-family: 'Fira Mono', monospace;
  margin: 0.6rem 0;
  line-height: 1.11;
  text-align: center;
  box-sizing: border-box;
  width: 33%;
  text-transform: uppercase;
}

.space {
  font-size: 0;
}
</style>
