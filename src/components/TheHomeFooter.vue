<script setup lang="ts">
import { IonButton, IonTabBar, IonTabButton } from '@ionic/vue'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import MapIcon from '@/components/icons/crypto-map.vue'
import HomeIcon from '@/components/icons/home.vue'
import { useDevice } from '@/composables/useDevice'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'

const props = defineProps<{
  isFirstRender: boolean
  isPaymentDisabled: boolean
}>()

const { isIOS } = useDevice()
const { showAnimations } = storeToRefs(useApp())

const isPaymentDisabled = computed(() => props.isPaymentDisabled)
</script>

<template>
  <IonTabBar slot="bottom" class="pt-1 grid grid-cols-[1fr_2fr_1fr] px-4 relative" mode="md">
    <IonTabButton tab="home" href="/app/home">
      <HomeIcon class="h-6" />
    </IonTabButton>
    <motion.div
      class="w-full"
      :initial="{ opacity: 0, y: 50 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ duration: showAnimations ? 0.4 : 0, ease: 'easeOut' }"
    >
      <div>
        <IonButton
          class="w-3/4 py-2 mx-auto text-base" expand="block"
          :class="{ 'pb-0': isIOS }"
          :disabled="isPaymentDisabled"
          @click="initializeFlow(FlowName.Payment, { isFullscreen: true })"
        >
          {{ $t('Pay') }}
        </IonButton>
      </div>
    </motion.div>
    <IonTabButton tab="map" href="/app/map">
      <MapIcon class="h-6" />
    </IonTabButton>
  </IonTabBar>
</template>

<style scoped>
ion-tab-bar {
  padding-bottom: calc(max(var(--ion-safe-area-bottom, 0px), 28px) + 8px);
}

ion-button {
  --box-shadow: 0px 6px 14px 0px #1F234826;
}

ion-tab-button {
  --color-selected: theme(colors.sky.DEFAULT);
  --color: #BCBDC8;
}
</style>
