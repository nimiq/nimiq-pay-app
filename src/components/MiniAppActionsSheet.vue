<script setup lang="ts">
import type { WidgetSize } from '@/lib/mini-app-widgets'
import type { MiniAppMenuContext } from '@/stores/mini-apps'
import { Browser } from '@capacitor/browser'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Share } from '@capacitor/share'
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, watch } from 'vue'
import FlagIcon from '@/components/icons/flag.vue'
import RemoveIcon from '@/components/icons/remove.vue'
import ShareIcon from '@/components/icons/share.vue'
import { i18n } from '@/i18n/i18n-setup'
import { miniAppOpenDeeplink } from '@/lib/mini-app-deeplink'
import { applyIconFallback, MINI_APP_FALLBACK_ICON as FALLBACK_ICON } from '@/lib/mini-app-icons'
import { BUILTIN_WIDGET_SCOPE } from '@/lib/mini-app-widget-builtins'
import { WIDGET_SIZES } from '@/lib/mini-app-widgets'

const props = defineProps<{
  open: boolean
  context: MiniAppMenuContext | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'remove'): void
  (e: 'size', size: WidgetSize): void
  (e: 'removeWidget'): void
}>()

const widgetSizes = computed(() => WIDGET_SIZES.filter(size => props.context?.widget?.sizes.includes(size)))
// Literal calls, so the i18n extraction finds every size name.
const sizeLabels = computed<Record<WidgetSize, string>>(() => ({ icon: i18n.t('Icon'), small: i18n.t('Small'), medium: i18n.t('Medium'), large: i18n.t('Large') }))

function close() {
  emit('update:open', false)
}

function onShare() {
  if (props.context) {
    const { name, url } = props.context.app
    Share.share({
      title: name,
      text: `Check out ${name}! You can try this Mini App in Nimiq Pay.`,
      url: miniAppOpenDeeplink(url),
    }).catch(() => {}) // user dismissing the share sheet rejects; not an error
  }
  close()
}

function onReport() {
  if (props.context?.reportUrl)
    void Browser.open({ url: props.context.reportUrl, toolbarColor: '#0582CA' })
  close()
}

function onRemove() {
  emit('remove')
  close()
}

function onSize(size: WidgetSize) {
  emit('size', size)
  close()
}

function onRemoveWidget() {
  emit('removeWidget')
  close()
}

// Color tokens differ per row; the shared layout classes live on the button in the template.
const actions = computed(() => {
  const context = props.context
  if (!context)
    return []
  return [
    // Nimiq Pay's own widgets have no Mini App to share.
    ...(context.app.url === BUILTIN_WIDGET_SCOPE
      ? []
      : [{ testid: 'mini-app-share-action', label: 'Share', icon: ShareIcon, classes: 'text-space active:bg-space/[0.04] focus-visible:ring-sky', onClick: onShare }]),
    ...(context.reportUrl
      ? [{ testid: 'mini-app-report-action', label: 'Report', icon: FlagIcon, classes: 'text-space active:bg-space/[0.04] focus-visible:ring-sky', onClick: onReport }]
      : []),
    ...(context.widget
      ? [{ testid: 'mini-app-remove-widget-action', label: i18n.t('Remove from Home'), icon: RemoveIcon, classes: 'text-cherry active:bg-cherry/[0.06] focus-visible:ring-cherry', onClick: onRemoveWidget }]
      : []),
    ...(context.removable
      ? [{ testid: 'mini-app-remove-action', label: 'Remove from Recently Viewed', icon: RemoveIcon, classes: 'text-cherry active:bg-cherry/[0.06] focus-visible:ring-cherry', onClick: onRemove }]
      : []),
  ]
})

// Light tap when the sheet appears, matching SwipeToDeleteRow's haptic vocabulary.
watch(() => props.open, (isOpen) => {
  if (isOpen)
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
})
</script>

<template>
  <DialogRoot :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogPortal>
      <!-- z-index inline: variables.css pushes every `body>div:not(#app)` (camera-preview rule)
           to z -100 with id-level specificity, which beats utility classes on portaled elements. -->
      <DialogOverlay class="mini-app-sheet-overlay fixed inset-0 bg-[#0D102C]/40" :style="{ zIndex: 99998 }" />
      <DialogContent
        class="mini-app-sheet fixed inset-x-0 bottom-0 mx-auto w-full max-w-md rounded-t-2xl bg-white px-4 pt-2 shadow outline-none"
        :style="{ zIndex: 99999, paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }"
      >
        <div class="mx-auto mt-1 mb-3 h-1 w-9 rounded-full bg-ash" />

        <template v-if="context">
          <div class="flex items-center gap-3 px-2 pb-3">
            <img
              :src="context.app.icon || FALLBACK_ICON"
              :alt="context.app.name"
              class="w-10 h-10 rounded-full object-contain bg-white/10 p-1 shrink-0"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              @error="applyIconFallback($event, context.app.url)"
            >
            <div class="flex min-w-0 flex-col">
              <DialogTitle class="text-lg font-semibold text-space [overflow-wrap:anywhere]">
                {{ context.app.name }}
              </DialogTitle>
              <p v-if="context.address" data-testid="mini-app-address" class="text-sm text-space/60 [overflow-wrap:anywhere]">
                {{ context.address }}
              </p>
            </div>
          </div>
          <DialogDescription class="sr-only">
            Actions for {{ context.app.name }}
          </DialogDescription>

          <div v-if="context.widget && widgetSizes.length > 1" data-testid="mini-app-widget-size" class="flex items-center justify-between gap-3 px-2 pb-3">
            <span class="text-lg font-semibold text-space">{{ $t('Size') }}</span>
            <div class="flex gap-1 rounded-full bg-space/[0.06] p-1" role="group" :aria-label="$t('Widget size')">
              <button
                v-for="size in widgetSizes"
                :key="size"
                type="button"
                :data-testid="`mini-app-widget-size-${size}`"
                :aria-pressed="size === context.widget.size"
                class="relative rounded-full px-3 py-1.5 text-sm font-bold before:absolute before:inset-x-0 before:content-[''] before:-inset-y-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
                :class="size === context.widget.size ? 'bg-white text-space shadow' : 'text-space/60'"
                @click="onSize(size)"
              >
                {{ sizeLabels[size] }}
              </button>
            </div>
          </div>
          <div class="flex flex-col divide-y divide-ash">
            <button
              v-for="action in actions"
              :key="action.testid"
              type="button"
              :data-testid="action.testid"
              class="flex items-center gap-3 w-full min-h-[56px] px-2 rounded-lg text-left text-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2"
              :class="action.classes"
              @click="action.onClick"
            >
              <component :is="action.icon" class="w-6 h-6 shrink-0" />
              <span>{{ action.label }}</span>
            </button>
          </div>

          <DialogClose as-child>
            <button
              type="button"
              class="mt-3 w-full rounded-full bg-space/[0.06] py-3 text-base font-bold text-space transition-colors active:bg-space/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
            >
              Cancel
            </button>
          </DialogClose>
        </template>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
/* Reka's Presence waits for these keyframe animations before unmounting on close. */
.mini-app-sheet-overlay[data-state="open"] {
  animation: mini-app-sheet-fade-in 200ms ease-out;
}
.mini-app-sheet-overlay[data-state="closed"] {
  animation: mini-app-sheet-fade-out 180ms ease-in;
}
.mini-app-sheet[data-state="open"] {
  animation: mini-app-sheet-slide-up 250ms cubic-bezier(0.16, 1, 0.3, 1);
}
.mini-app-sheet[data-state="closed"] {
  animation: mini-app-sheet-slide-down 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes mini-app-sheet-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes mini-app-sheet-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes mini-app-sheet-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
@keyframes mini-app-sheet-slide-down {
  from { transform: translateY(0); }
  to { transform: translateY(100%); }
}

/* Reduced motion: cross-fade only, no vertical travel. */
@media (prefers-reduced-motion: reduce) {
  .mini-app-sheet[data-state="open"] {
    animation: mini-app-sheet-fade-in 150ms ease-out;
  }
  .mini-app-sheet[data-state="closed"] {
    animation: mini-app-sheet-fade-out 150ms ease-in;
  }
}
</style>
