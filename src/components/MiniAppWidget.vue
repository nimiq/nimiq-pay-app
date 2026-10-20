<script setup lang="ts">
import type { DisplayValue, WidgetView } from '@/stores/mini-app-widgets'
import { FormattableNumber } from '@nimiq/utils'
import { onLongPress, useNow } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import HorizontalEllipsisIcon from '@/components/icons/horizontal-ellipsis.vue'
import { applyIconFallback } from '@/lib/mini-app-icons'
import { useApp } from '@/stores/app'

const { view, preview = false } = defineProps<{
  view: WidgetView
  preview?: boolean
}>()

const emit = defineEmits<{
  (e: 'open', url: string): void
  (e: 'menu'): void
}>()

const app = useApp()
const now = useNow({ interval: 30_000 })

// Intl formats any three-letter code as money, crypto tickers included, so only ISO 4217 codes count as fiat.
const FIAT_CODES = new Set(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : ['USD', 'EUR', 'CRC', 'GMD'])
const TONE_DOT = { neutral: '', positive: 'bg-mint', attention: 'bg-pumpkin', negative: 'bg-cherry' } as const
const SPAN = { icon: 'col-span-1', small: 'col-span-2', medium: 'col-span-4', large: 'col-span-4' } as const

// Not useCurrencyFormatter: its crypto path takes luna and its fiat path shows sub-cent prices as "~€0.00"; widget amounts are decimal strings.
function formatValue(value: DisplayValue): string {
  if (value.kind === 'text')
    return value.text
  if (value.kind === 'pending')
    return '…'
  if (value.kind === 'change') {
    const digits = new Intl.NumberFormat(app.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(value.percent))
    return isFlat(value.percent) ? `${digits} %` : `${value.percent < 0 ? '−' : '+'}${digits} %`
  }
  const amount = Number(value.amount)
  if (FIAT_CODES.has(value.currency)) {
    const digits = amount !== 0 && Math.abs(amount) < 1 ? { minimumSignificantDigits: 2, maximumSignificantDigits: 3 } : {}
    return new Intl.NumberFormat(app.language, { style: 'currency', currency: value.currency, currencyDisplay: 'narrowSymbol', ...digits }).format(amount)
  }
  const maxDecimals = Math.abs(amount) >= 1000 ? 2 : Math.abs(amount) >= 1 ? 4 : amount !== 0 && Math.abs(amount) < 1e-8 ? 18 : 8
  return `${new FormattableNumber(value.amount).toString({ maxDecimals, useGrouping: true })} ${value.currency}`
}

function isFlat(percent: number): boolean {
  return Number(Math.abs(percent).toFixed(1)) === 0
}

function changeClass(value: DisplayValue | undefined): string {
  return value?.kind === 'change' && !isFlat(value.percent) ? (value.percent < 0 ? 'text-cherry' : 'text-mint') : ''
}

const dot = computed(() => TONE_DOT[view.tone])
const isCard = computed(() => view.size !== 'icon')
const showExtras = computed(() => view.size === 'medium' || view.size === 'large')

const timeLeft = computed(() => {
  const until = view.countdown?.until
  const left = until === undefined ? 0 : until - now.value.getTime()
  if (left <= 0)
    return undefined
  const minutes = left / 60_000
  const [amount, unit]: [number, string] = minutes < 60
    ? [Math.max(1, Math.floor(minutes)), 'minute']
    : minutes < 48 * 60 ? [Math.floor(minutes / 60), 'hour'] : [Math.floor(minutes / 1440), 'day']
  return new Intl.NumberFormat(app.language, { style: 'unit', unit, unitDisplay: 'short' }).format(amount)
})

const chartShape = computed(() => {
  const chart = view.chart
  if (!chart || chart.points.length < 2)
    return undefined
  const min = chart.kind === 'bars' ? Math.min(0, ...chart.points) : Math.min(...chart.points)
  const span = Math.max(...chart.points) - min || 1
  const y = (p: number) => 30 - ((p - min) / span) * 28
  if (chart.kind === 'line')
    return { kind: 'line' as const, points: chart.points.map((p, i) => `${(i / (chart.points.length - 1)) * 100},${y(p)}`).join(' ') }
  const width = 100 / chart.points.length
  return { kind: 'bars' as const, bars: chart.points.map((p, i) => ({ x: i * width + width * 0.15, width: width * 0.7, y: y(p), height: 32 - y(p) })) }
})

const staleTime = computed(() => {
  if (view.staleSince === undefined)
    return undefined
  const today = new Date(view.staleSince).toDateString() === now.value.toDateString()
  const day = today ? {} : { day: 'numeric', month: 'short' } as const
  return new Intl.DateTimeFormat(app.language, { ...day, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(view.staleSince)
})

const ariaLabel = computed(() => `${view.appName}: ${[view.label, formatValue(view.value), view.info && formatValue(view.info)].filter(Boolean).join(', ')}`)

// A long press opens the menu like the small corner target does; the click its release may still fire must not also open the Mini App.
let longPressed = false
onLongPress(useTemplateRef<HTMLElement>('card'), () => {
  if (!preview)
    emit('menu')
}, { onMouseUp: (_duration, _distance, isLongPress) => {
  longPressed = isLongPress
} })

function onClickCapture(event: MouseEvent) {
  // A keyboard or assistive click has detail 0 and is never the release of a long press.
  if (longPressed && event.detail !== 0)
    event.stopPropagation()
  longPressed = false
}
</script>

<template>
  <div
    ref="card"
    class="relative overflow-hidden rounded-2xl bg-white text-space shadow-card"
    :class="[SPAN[view.size], isCard ? 'flex flex-col gap-1 px-4 pt-3 pb-4' : 'flex aspect-square flex-col items-center justify-center gap-1.5 p-2']"
    :data-testid="`mini-app-widget-${view.size}`"
    @click.capture="onClickCapture"
    @contextmenu.prevent="!preview && emit('menu')"
  >
    <!-- The button is the whole card's tap target; everything painted above it is pointer-events-none except row links and the menu. -->
    <button
      v-if="view.url"
      type="button"
      data-testid="widget-open"
      class="absolute inset-0 rounded-2xl transition-colors active:bg-space/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky"
      :disabled="preview"
      :aria-label="ariaLabel"
      @click="emit('open', view.url!)"
    />

    <template v-if="!isCard">
      <span class="pointer-events-none relative">
        <img :src="view.appIcon" alt="" class="size-10 rounded-full object-contain" referrerpolicy="no-referrer" @error="applyIconFallback($event, view.scope)">
        <span v-if="dot" class="absolute -bottom-0.5 -left-0.5 size-3 rounded-full ring-2 ring-white" :class="dot" />
      </span>
      <span class="pointer-events-none w-full min-w-0 truncate text-center text-xs font-semibold">{{ view.appName }}</span>
    </template>

    <template v-else>
      <span class="pointer-events-none relative flex min-w-0 items-center gap-2 text-sm font-bold text-space/60" :class="{ 'pr-8': !preview }">
        <img :src="view.appIcon" alt="" class="size-5 shrink-0 rounded-full object-contain" referrerpolicy="no-referrer" @error="applyIconFallback($event, view.scope)">
        <span class="min-w-0 truncate">{{ view.appName }}</span>
      </span>

      <span v-if="view.label" class="pointer-events-none relative mt-1 flex min-w-0 items-center gap-1.5 text-sm font-semibold text-space/60">
        <span v-if="dot" class="size-2 shrink-0 rounded-full" :class="dot" />
        <span data-testid="widget-label" class="min-w-0 truncate">{{ view.label }}</span>
      </span>

      <span class="pointer-events-none relative flex min-w-0 items-end justify-between gap-3">
        <span class="flex min-w-0 items-center gap-2">
          <span v-if="dot && !view.label" class="size-2.5 shrink-0 rounded-full" :class="dot" />
          <span class="min-w-0 truncate text-2xl font-bold leading-tight" :class="changeClass(view.value)">{{ formatValue(view.value) }}</span>
        </span>
        <span v-if="showExtras && timeLeft" class="shrink-0 text-right text-sm leading-tight">
          <span class="block text-xs text-space/50">{{ view.countdown!.label }}</span>
          <span class="font-bold">{{ timeLeft }}</span>
        </span>
      </span>

      <span v-if="view.info" class="pointer-events-none relative min-w-0 truncate text-sm text-space/60" :class="changeClass(view.info)">{{ formatValue(view.info) }}</span>

      <span v-if="showExtras && view.progress !== undefined" class="pointer-events-none relative mt-2 h-1 w-full overflow-hidden rounded-full bg-space/10">
        <span data-testid="widget-progress" class="block h-full rounded-full bg-sky" :style="{ width: `${view.progress * 100}%` }" />
      </span>

      <template v-if="view.size === 'large'">
        <span v-if="view.rows.length" data-testid="widget-rows" class="pointer-events-none relative mt-3 flex flex-col divide-y divide-space/10 border-t border-space/10">
          <template v-for="(row, i) in view.rows" :key="i">
            <button
              v-if="row.url && !preview"
              type="button"
              data-testid="widget-row-link"
              class="pointer-events-auto flex min-w-0 items-center justify-between gap-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
              @click="emit('open', row.url)"
            >
              <span class="min-w-0 truncate text-space/60">{{ row.label }}</span>
              <span class="shrink-0 font-semibold" :class="changeClass(row.value)">{{ formatValue(row.value) }} ›</span>
            </button>
            <span v-else class="pointer-events-none flex min-w-0 items-center justify-between gap-3 py-2 text-sm">
              <span class="min-w-0 truncate text-space/60">{{ row.label }}</span>
              <span class="shrink-0 font-semibold" :class="changeClass(row.value)">{{ formatValue(row.value) }}</span>
            </span>
          </template>
        </span>
        <svg v-else-if="chartShape" data-testid="widget-chart" viewBox="0 0 100 32" preserveAspectRatio="none" class="pointer-events-none relative mt-3 h-16 w-full text-sky" aria-hidden="true">
          <polyline v-if="chartShape.kind === 'line'" :points="chartShape.points" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
          <template v-else>
            <rect v-for="(bar, i) in chartShape.bars" :key="i" :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" rx="0.8" fill="currentColor" />
          </template>
        </svg>
      </template>

      <span v-if="staleTime" class="pointer-events-none relative mt-1 text-xs text-space/50">
        {{ $t('Not updated since {time}', { time: staleTime }) }}
      </span>
    </template>

    <button
      v-if="!preview"
      type="button"
      data-testid="widget-menu"
      aria-haspopup="menu"
      :aria-label="$t('More actions for {name}', { name: view.appName })"
      class="absolute top-0 right-0 grid place-items-center text-space/40 transition-colors active:bg-space/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky"
      :class="isCard ? 'size-11 rounded-full' : 'size-[18px] rounded-tr-2xl'"
      @click="emit('menu')"
    >
      <HorizontalEllipsisIcon :class="isCard ? 'h-[5px] w-5' : 'h-[3.5px] w-3.5'" />
    </button>
  </div>
</template>
