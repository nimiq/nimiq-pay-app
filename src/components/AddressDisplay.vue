<script setup lang="ts">
import { IonRippleEffect } from '@ionic/vue'
import type { ComputedRef } from 'vue'
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

function handleCopy() {
  if (!props.isCopyable)
    return
  Clipboard.write({
    string: props.address,
  })
}
</script>

<template>
  <div class="relative overflow-hidden text-3xl text-blue-500 rounded address-display bg-blue-100/60 ion-activatable ripple-parent" @click="handleCopy">
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
  font-weight: 500;
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
