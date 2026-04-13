<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useModal } from '@/composables/useModal'
import { useApp } from '@/stores/app'

const MAP_URL = 'https://crypto-map.je-cf9.workers.dev/'

const { closeModal } = useModal()
const { language } = storeToRefs(useApp())

const mapUrl = computed(() => `${MAP_URL}?searchBarPosition=bottom&lang=${language.value}`)
</script>

<template>
  <div class="relative w-full h-full">
    <!-- eslint-disable-next-line vue/html-self-closing -- self closing iframe is invalid html which the i18n extractor can't parse -->
    <iframe class="absolute inset-0 w-full h-full" sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation" :src="mapUrl"></iframe>

    <button
      class="absolute right-4 top-2 z-10 rounded-full bg-[#DADADA] p-1.5"
      aria-label="Close map"
      @click="closeModal()"
    >
      <IonIcon :icon="close" class="text-white w-5 h-5 block" />
    </button>
  </div>
</template>
