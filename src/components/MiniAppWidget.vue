<script setup lang="ts">
import type { HomeWidget } from '@/stores/mini-app-widgets'
import { IonRippleEffect, IonSkeletonText } from '@ionic/vue'
import { useNow } from '@vueuse/core'
import { computed } from 'vue'
import HorizontalEllipsisIcon from '@/components/icons/horizontal-ellipsis.vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { usePrice } from '@/composables/usePrice'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { applyIconFallback } from '@/lib/mini-app-icons'
import { Crypto } from '@/stores/app'
import { useMiniApps } from '@/stores/mini-apps'

const { widget } = defineProps<{
  widget: HomeWidget
}>()

const emit = defineEmits<{
  (e: 'open'): void
  (e: 'menu'): void
}>()

const { formatCrypto } = useCurrencyFormatter()
const now = useNow({ interval: 30_000 })

const data = computed(() => widget.data)
const icon = computed(() => useMiniApps().iconForUrl(widget.appUrl))
const title = computed(() => `${widget.appName} · ${data.value?.title || widget.manifest.name}`)

const valueLuna = computed(() => Number(data.value?.value?.luna ?? 0))
const { fiat } = usePrice(valueLuna)

const untilMs = computed(() => (data.value?.countdown?.until ?? 0) * 1000)
const showCountdown = computed(() => untilMs.value > now.value.getTime())
const { formatted: countdownIn } = useRelativeTime({ timestamp: untilMs })
const { formatted: updatedAgo } = useRelativeTime({ timestamp: computed(() => widget.fetchedAt) })
</script>

<template>
  <div class="relative w-full rounded-md bg-white shadow-card text-space" data-testid="mini-app-widget">
    <button
      type="button"
      class="ion-activatable relative overflow-hidden flex flex-col gap-2.5 w-full rounded-md px-4 pt-3.5 pb-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
      @click="emit('open')"
    >
      <div class="flex items-center gap-2 min-w-0 pr-8 text-sm font-bold text-space/60">
        <img
          :src="icon"
          alt=""
          class="w-5 h-5 rounded shrink-0 object-contain"
          referrerpolicy="no-referrer"
          @error="applyIconFallback($event, widget.appUrl)"
        >
        <span class="truncate">{{ title }}</span>
      </div>

      <template v-if="data">
        <div v-if="data.value" class="flex flex-col">
          <span class="text-sm font-bold text-space/50">{{ data.value.label }}</span>
          <span v-if="data.value.luna !== undefined" class="font-mono text-2xl font-medium leading-tight">
            {{ valueLuna ? formatCrypto(valueLuna) : '0' }} <small class="text-base text-space/60">NIM</small>
          </span>
          <span v-else class="text-xl font-semibold leading-tight">{{ data.value.text }}</span>
          <span v-if="valueLuna" class="font-mono text-sm text-space/50">≈ {{ fiat.formatted }}</span>
        </div>

        <div v-if="data.rows.length || showCountdown" class="flex flex-col gap-1 border-t border-space/10 pt-2.5 text-sm">
          <div v-if="showCountdown && data.countdown" class="flex justify-between gap-3">
            <span class="text-space/60">{{ data.countdown.label }}</span>
            <span class="font-bold text-right">{{ countdownIn }}</span>
          </div>
          <div v-for="row in data.rows" :key="row.label" class="flex justify-between gap-3">
            <span class="text-space/60">{{ row.label }}</span>
            <span v-if="row.luna !== undefined" class="font-mono text-right">{{ formatCrypto(Number(row.luna), { currency: Crypto.NIM }) }}</span>
            <span v-else class="font-bold text-right">{{ row.text }}</span>
          </div>
        </div>

        <p v-if="widget.failedAt" class="rounded-md bg-space/[0.06] px-2.5 py-2 text-sm font-semibold text-space/60">
          {{ $t('Couldn\'t reach {name}. Last updated {time}.', { name: widget.appName, time: updatedAgo }) }}
        </p>
        <p
          v-else-if="data.message"
          class="rounded-md px-2.5 py-2 text-sm font-semibold"
          :class="data.tone === 'attention' ? 'bg-pumpkin/10 text-pumpkin' : 'bg-space/[0.06] text-space/60'"
        >
          {{ data.message }}
        </p>
      </template>

      <p v-else-if="widget.failedAt" class="rounded-md bg-space/[0.06] px-2.5 py-2 text-sm font-semibold text-space/60">
        {{ $t('Couldn\'t reach {name}.', { name: widget.appName }) }}
      </p>

      <div v-else class="flex flex-col gap-2" data-testid="mini-app-widget-loading">
        <IonSkeletonText :animated="true" class="h-3 w-1/4 rounded" />
        <IonSkeletonText :animated="true" class="h-6 w-1/2 rounded" />
      </div>

      <IonRippleEffect />
    </button>

    <button
      type="button"
      aria-haspopup="menu"
      :aria-label="`More actions for ${widget.appName}`"
      data-testid="mini-app-widget-menu"
      class="absolute top-1.5 right-1.5 grid place-items-center w-10 h-10 rounded-full text-space/40 transition-colors active:bg-space/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
      @click="emit('menu')"
    >
      <HorizontalEllipsisIcon class="w-5 h-[5px]" />
    </button>
  </div>
</template>
