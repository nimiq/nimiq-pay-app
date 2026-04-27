<script setup lang="ts">
import type { HostCharAnalysis } from '@/lib/url-safety'
import { IonButton, IonContent, IonIcon, modalController } from '@ionic/vue'
import { alertCircleOutline, warningOutline } from 'ionicons/icons'
import { computed } from 'vue'
import { analyzeUrlSafety, isNonRenderableCodePoint } from '@/lib/url-safety'

export interface MiniAppWarningDismissPayload {
  confirmed: boolean
}

const props = defineProps<{
  /** Normalized URL the user will open if they confirm. */
  url: string
  /**
   * Original pre-normalization input — analyzed for homograph/zero-width/bidi
   * payloads that WHATWG URL parsing would otherwise hide. Defaults to `url`
   * when the caller has nothing rawer to provide.
   */
  rawUrl?: string
}>()

const analysis = computed(() => analyzeUrlSafety(props.rawUrl ?? props.url))

function describeChar(ch: HostCharAnalysis): string {
  if (!ch.suspicious)
    return ''
  const label = ch.reason || 'suspicious character'
  return `${label} (${ch.codePoint})`
}

function renderChar(ch: HostCharAnalysis): string {
  const code = ch.ch.codePointAt(0)
  if (code === undefined)
    return ch.ch
  return isNonRenderableCodePoint(code) ? '␣' : ch.ch
}

function cancel() {
  modalController.dismiss({ confirmed: false } satisfies MiniAppWarningDismissPayload, 'cancel')
}

function confirm() {
  modalController.dismiss({ confirmed: true } satisfies MiniAppWarningDismissPayload, 'confirm')
}
</script>

<template>
  <IonContent class="ion-padding">
    <div class="flex flex-col gap-4 py-4">
      <IonIcon
        :icon="warningOutline"
        class="w-14 h-14 mx-auto rounded-full bg-red-100 text-red-600 text-3xl p-3"
      />

      <h1 class="text-xl font-bold text-center text-space">
        Open this mini app?
      </h1>

      <p class="text-sm text-space/70 text-center">
        You have not opened this URL before. Check the address carefully — scammers can disguise fake sites using look-alike characters.
      </p>

      <div class="rounded-lg border border-space/10 bg-white/60 p-3 flex flex-col gap-2">
        <p class="text-xs font-semibold uppercase text-space/50 tracking-wide">
          Hostname
        </p>
        <p class="font-mono text-base break-all leading-relaxed">
          <span
            v-for="(c, i) in analysis.hostChars"
            :key="i"
            :class="c.suspicious ? 'bg-red-100 text-red-700 rounded px-0.5 underline decoration-wavy decoration-red-500' : ''"
            :title="describeChar(c)"
          >{{ renderChar(c) }}</span>
        </p>
        <p class="text-xs font-semibold uppercase text-space/50 tracking-wide mt-2">
          Will open
        </p>
        <p class="font-mono text-xs break-all text-space/80">
          {{ url }}
        </p>
      </div>

      <div v-if="analysis.warnings.length" class="rounded-lg bg-red-50 border border-red-200 p-3 flex gap-2">
        <IonIcon :icon="alertCircleOutline" class="text-red-600 text-lg shrink-0 mt-0.5" />
        <ul class="text-sm text-red-800 flex flex-col gap-1">
          <li v-for="w in analysis.warnings" :key="w">
            {{ w }}
          </li>
        </ul>
      </div>

      <div class="flex flex-col gap-2 mt-2">
        <IonButton expand="block" color="medium" @click="cancel">
          Cancel
        </IonButton>
        <IonButton expand="block" fill="clear" color="danger" @click="confirm">
          Open anyway
        </IonButton>
      </div>
    </div>
  </IonContent>
</template>
