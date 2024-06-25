<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { asyncComputed } from '@vueuse/core'
import InfoIcon from '@/components/icons/info.vue'
import { useLocalWallet } from '@/stores/local-wallet'

defineEmits<{ done: [] }>()

const firstWord = asyncComputed(() => useLocalWallet().getWords().then(({ data }) => data?.at(0) || ''), '')
</script>

<template>
  <div class="flex flex-col items-center w-full h-full mt-16">
    <div class="grid grid-cols-1 grid-rows-1 *:row-span-full *:col-span-full pointer-events-none">
      <ol class="grid grid-cols-2 gap-2.5 [counter-reset:custom-reset] p-[1.5px]">
        <li
          v-for="i in 8" :key="i"
          class="[counter-increment:custom-counter] flex gap-1.5 px-1.5 py-2 text-[15px]/[18.5px] before:content-[counter(custom-counter,decimal-leading-zero)] ring-[1.5px] rounded before:font-semibold min-w-[136px] before:tracking-tight"
          :class="{ 'text-sky before:text-sky/40 ring-sky/40': i === 1, 'ring-space/15 text-space/40': i > 1 }"
        >
          <span v-if="i === 1" class="flex gap-px after:w-px after:h-full after:bg-sky">{{ firstWord }}</span>
        </li>
      </ol>
      <div class="bg-gradient-to-b from-transparent to-white mt-9" />
    </div>
    <div class="flex items-baseline gap-2 mt-auto">
      <InfoIcon class="size-3 stroke-[1.5] text-space/50 shrink-0" />
      <p class="text-space/60 text-center text-pretty">
        {{ $t('Please make sure no one can see your screen before continuing.') }}
      </p>
    </div>
    <IonButton size="small" class="self-stretch my-6 text-base font-bold" @click="$emit('done')">
      {{ $t('Continue to Login Words') }}
    </IonButton>
  </div>
</template>
