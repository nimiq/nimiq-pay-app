<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import AssetSwitcher from '@/components/AssetSwitcher.vue'
import { useDevice } from '@/composables/useDevice'
import { Modal, useModal } from '@/composables/useModal'
import { isMiniAppsEnabled } from '@/lib'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useMiniApps } from '@/stores/mini-apps'

defineProps<{
  isPaymentDisabled: boolean
}>()

const { isIOS } = useDevice()
const { showAnimations, isNimiqAsset } = storeToRefs(useApp())
const { showModal } = useModal()
const { featuredDApps, nonFeaturedDApps, recentlyViewedDApps } = storeToRefs(useMiniApps())

function getDAppKey(url: string) {
  // Recent entries can differ only by a trailing slash, so normalize before deduping buckets.
  return url.replace(/\/$/, '')
}

const topDAppIcons = computed(() => {
  const selectedDApps = new Set<string>()
  const icons: string[] = []

  const appendIcons = (dapps: Array<{ url: string, icon: string }>) => {
    for (const dapp of dapps) {
      if (icons.length >= 3)
        return

      const key = getDAppKey(dapp.url)
      if (selectedDApps.has(key))
        continue

      selectedDApps.add(key)
      icons.push(dapp.icon)
    }
  }

  appendIcons(featuredDApps.value)
  appendIcons(recentlyViewedDApps.value)
  appendIcons([...nonFeaturedDApps.value].sort((a, b) => a.name.localeCompare(b.name)))

  return icons
})
</script>

<template>
  <div slot="bottom" class="footer grid grid-cols-[1fr_2fr_1fr] items-center px-4 pt-1 bg-white relative">
    <AssetSwitcher />

    <motion.div
      class="w-full"
      :initial="{ opacity: 0, y: 50 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ duration: showAnimations ? 0.4 : 0, ease: 'easeOut' }"
    >
      <div>
        <IonButton
          aria-label="Pay"
          class="w-3/4 py-2 mx-auto text-base" expand="block"
          :class="{ 'pb-0': isIOS, 'usdt-button': !isNimiqAsset }"
          :disabled="isPaymentDisabled"
          @click="initializeFlow(FlowName.Payment, { isFullscreen: true })"
        >
          {{ $t('Pay') }}
        </IonButton>
      </div>
    </motion.div>

    <div class="flex justify-end">
      <button
        v-if="isMiniAppsEnabled"
        aria-label="Mini Apps"
        class="p-2 relative overflow-hidden rounded-3xl"
        @click="showModal(Modal.MiniApps)"
      >
        <div class="relative h-7 w-16">
          <img
            v-for="(icon, i) in topDAppIcons"
            :key="i"
            :src="icon"
            class="size-7 rounded-full ring-2 ring-white object-cover absolute top-0"
            :style="{ zIndex: 3 - i, left: `${i * 14}px` }"
            alt=""
          >
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.footer {
  padding-bottom: var(--ion-safe-area-bottom, 0px);
}

ion-button {
  --box-shadow: 0px 6px 14px 0px #1F234826;
}

ion-button.usdt-button {
  --background: var(--radial-gradient-green-usdt);
}
</style>
