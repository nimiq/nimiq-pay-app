<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, watch } from 'vue'
import MiniAppWidget from '@/components/MiniAppWidget.vue'
import { applyIconFallback, MINI_APP_FALLBACK_ICON } from '@/lib/mini-app-icons'
import { WIDGET_GRID_CLASS } from '@/lib/mini-app-widgets'
import { useMiniAppWidgets } from '@/stores/mini-app-widgets'

const widgets = useMiniAppWidgets()

const review = computed(() => widgets.imageReview)
const previews = computed(() => review.value?.keys.map(key => ({ key, view: widgets.reviewView(key)! })) ?? [])
const app = computed(() => widgets.views.find(view => view.scope === review.value?.scope && view.widgetId === review.value?.widgetId))
const canAccept = computed(() => !widgets.reviewLoading && previews.value.some(preview => preview.view.background))

watch(review, (open) => {
  if (open)
    void widgets.loadReviewImages()
}, { immediate: true })

function onOpenChange(open: boolean) {
  if (!open)
    widgets.answerImageReview(false)
}
</script>

<template>
  <DialogRoot :open="!!review" @update:open="onOpenChange">
    <DialogPortal>
      <!-- z-index inline, as in MiniAppActionsSheet: a portaled element otherwise sits under the app. -->
      <DialogOverlay class="fixed inset-0 bg-[#0D102C]/40" :style="{ zIndex: 99998 }" />
      <DialogContent
        v-if="review"
        class="fixed inset-x-0 bottom-0 mx-auto flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white px-4 pt-2 shadow outline-none"
        :style="{ zIndex: 99999, paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }"
      >
        <div class="mx-auto mt-1 mb-3 h-1 w-9 rounded-full bg-ash" />
        <div class="flex items-center gap-3 px-2 pb-3">
          <img
            :src="app?.appIcon || MINI_APP_FALLBACK_ICON"
            alt=""
            class="size-10 shrink-0 rounded-full bg-white/10 object-contain p-1"
            referrerpolicy="no-referrer"
            @error="applyIconFallback($event, review.scope)"
          >
          <div class="flex min-w-0 flex-col">
            <DialogTitle class="text-lg font-semibold text-space break-words">
              {{ $t('New images for {name}', { name: widgets.widgetName(review.scope, review.widgetId) }) }}
            </DialogTitle>
            <p class="text-sm text-space/60 break-words">
              {{ app?.appAddress ?? app?.appName }}
            </p>
          </div>
        </div>
        <DialogDescription class="px-2 pb-4 text-sm text-space/70">
          {{ $t('Your widget keeps its current images until you choose. Each new image is shown here in the widget\'s example state.') }}
        </DialogDescription>

        <div class="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
          <div :class="WIDGET_GRID_CLASS">
            <template v-for="preview in previews" :key="preview.key">
              <div :data-testid="`review-preview-${preview.key}`" class="contents">
                <MiniAppWidget :view="preview.view" preview />
              </div>
              <p v-if="!widgets.reviewLoading && !preview.view.background" :data-testid="`review-failed-${preview.key}`" class="col-span-4 -mt-1 text-xs text-space/60">
                {{ $t('This image could not be checked, so the card stays plain with it.') }}
              </p>
            </template>
          </div>
        </div>

        <div class="flex flex-col gap-2 pt-4">
          <button
            type="button"
            data-testid="review-approve"
            :disabled="!canAccept"
            class="w-full rounded-full bg-sky py-3 text-base font-bold text-white transition-colors active:bg-sky/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2"
            @click="widgets.answerImageReview(true)"
          >
            {{ previews.length > 1 ? $t('Show these images') : $t('Show this image') }}
          </button>
          <button
            type="button"
            data-testid="review-decline"
            class="w-full rounded-full bg-space/[0.06] py-3 text-base font-bold text-space transition-colors active:bg-space/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
            @click="widgets.answerImageReview(false)"
          >
            {{ $t('Not now') }}
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
