<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { stepEmits } from '@/types/steps'

defineProps({ address: { type: String } })
defineEmits(stepEmits)
</script>

<template>
  <div class="flex flex-col self-start w-full h-full pt-8">
    <div class="mt-28 mx-auto">
      <div class="flex gap-x-8 mt-28 mx-auto justify-center">
        {{ address }}
      </div>

      <button @click="$emit('done')">
        Scan Cashlink de
      </button>
    </div>

    <IonButton size="small" class="text-base font-bold mt-auto w-full" @click="$emit('done', address)">
      Open Wallet
    </IonButton>
    Copy address
  </div>
</template>
