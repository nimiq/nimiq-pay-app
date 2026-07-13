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
import { applyIconFallback } from '@/lib/mini-app-icons'
import { useApp } from '@/stores/app'
import { stripTrailingSlash, useMiniApps } from '@/stores/mini-apps'

defineProps<{
  isPaymentDisabled: boolean
}>()

const { isIOS } = useDevice()
const { showAnimations, isNimiqAsset } = storeToRefs(useApp())
const { showModal } = useModal()
const miniApps = useMiniApps()
const { featuredDApps, nonFeaturedDApps, recentlyViewedDApps } = storeToRefs(miniApps)

const topDAppIcons = computed(() => {
  const selectedDApps = new Set<string>()
  const icons: Array<{ icon: string, url: string }> = []

  const appendIcons = (dapps: Array<{ url: string, icon: string }>) => {
    for (const dapp of dapps) {
      if (icons.length >= 3)
        return

      // Recent entries differ only by trailing slash, so normalize before dedupe.
      const key = stripTrailingSlash(dapp.url)
      if (selectedDApps.has(key))
        continue

      selectedDApps.add(key)
      // Prefer the curated awesome icon: recently-viewed entries persist whatever icon
      // was supplied at launch (deeplinks fall back to favicon).
      icons.push({ icon: miniApps.iconForUrl(dapp.url) ?? dapp.icon, url: dapp.url })
    }
  }

  // Lead with the most recent Mini App; fill the other two from featured, then non-featured.
  appendIcons(recentlyViewedDApps.value.slice(0, 1))
  appendIcons(featuredDApps.value)
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
          @click="initializeFlow(FlowName.Payment, { isFullscreen: true, analyticsSource: 'footer_pay_button' })"
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
        @click="showModal(Modal.MiniApps, { analytics: { featureName: 'mini_apps', source: 'footer' } })"
      >
        <div class="relative h-7 w-16">
          <img
            v-for="(item, i) in topDAppIcons"
            :key="i"
            :src="item.icon"
            class="size-7 aspect-square shrink-0 rounded-full ring-2 ring-gray-100 bg-white object-contain object-center absolute top-0"
            :style="{ zIndex: 3 - i, left: `${i * 14}px` }"
            alt=""
            decoding="async"
            referrerpolicy="no-referrer"
            @error="applyIconFallback($event, item.url)"
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
