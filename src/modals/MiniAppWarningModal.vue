<script setup lang="ts">
import type { HostCharAnalysis } from '@/lib/url-safety'
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar, modalController } from '@ionic/vue'
import { close, warningOutline } from 'ionicons/icons'
import { computed, useId } from 'vue'
import { i18n } from '@/i18n/i18n-setup'
import { analyzeUrlSafety, isNonRenderableCodePoint } from '@/lib/url-safety'

export interface MiniAppWarningDismissPayload {
  confirmed: boolean
}

interface SuspiciousCharRow {
  position: number
  glyph: string
  codePoint: string
  reason: string
}

const props = defineProps<{
  /** Normalized URL the user will open if they confirm. */
  url: string
  /**
   * Original pre-normalization input. Analyzed for homograph/zero-width/bidi
   * payloads that WHATWG URL parsing would otherwise hide. Defaults to `url`
   * when the caller has nothing rawer to provide.
   */
  rawUrl?: string
}>()

const titleId = useId()
const descId = useId()

const analysis = computed(() => analyzeUrlSafety(props.rawUrl ?? props.url))

const suspiciousChars = computed<SuspiciousCharRow[]>(() =>
  analysis.value.hostChars.flatMap((c, i) => {
    if (!c.suspicious || !c.reason)
      return []
    return [{
      position: i + 1,
      glyph: renderChar(c),
      codePoint: c.codePoint,
      reason: translateReason(c.reason),
    }]
  }),
)

const generalWarnings = computed(() => {
  // url-safety emits per-character reasons as `Contains <reason>.`. Strip those
  // from the general list so the position-aware breakdown below isn't duplicated.
  const charReasonSet = new Set(
    analysis.value.hostChars
      .filter(c => c.suspicious && c.reason)
      .map(c => `Contains ${c.reason}.`),
  )
  return analysis.value.warnings
    .filter(w => !charReasonSet.has(w))
    .map(translateWarning)
})

const hasFlags = computed(
  () => suspiciousChars.value.length > 0 || generalWarnings.value.length > 0,
)

function renderChar(ch: HostCharAnalysis): string {
  const code = ch.ch.codePointAt(0)
  if (code === undefined)
    return ch.ch
  return isNonRenderableCodePoint(code) ? '␣' : ch.ch
}

function charClass(ch: HostCharAnalysis): string {
  return ch.suspicious
    ? 'rounded bg-pumpkin-200 px-0.5 underline decoration-wavy decoration-pumpkin'
    : ''
}

function translateReason(reason: string): string {
  switch (reason) {
    case 'zero-width character (invisible)':
      return i18n.t('zero-width character (invisible)')
    case 'direction-override / bidi control character':
      return i18n.t('direction-override or bidi control character')
    case 'non-ASCII character (may impersonate Latin letters)':
      return i18n.t('non-ASCII character (may impersonate Latin letters)')
    default:
      return reason
  }
}

function translateWarning(w: string): string {
  if (w.startsWith('Contains a punycode'))
    return i18n.t('Internationalized domain (punycode). Verify it matches the real site.')
  if (w === 'URL could not be parsed.')
    return i18n.t('This address could not be parsed.')
  return w
}

function cancel() {
  modalController.dismiss({ confirmed: false } satisfies MiniAppWarningDismissPayload, 'cancel')
}

function confirm() {
  modalController.dismiss({ confirmed: true } satisfies MiniAppWarningDismissPayload, 'confirm')
}
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton :aria-label="$t('Close')" @click.stop="cancel">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <div
    role="alertdialog"
    :aria-labelledby="titleId"
    :aria-describedby="descId"
    class="flex flex-col gap-5 px-6 pt-2 pb-8"
  >
    <h1
      :id="titleId"
      class="flex items-center justify-center gap-2 text-2xl font-semibold text-center text-space"
    >
      <IonIcon :icon="warningOutline" aria-hidden="true" class="text-pumpkin shrink-0 text-2xl" />
      {{ $t('Open this mini app?') }}
    </h1>

    <p :id="descId" class="text-center text-base text-space/70">
      {{ $t('You have not opened this address before. Read it carefully. Scammers can disguise fake sites with characters that look like normal letters.') }}
    </p>

    <section
      class="flex flex-col gap-2 rounded-lg bg-snow border border-space/10 p-4"
      aria-labelledby="miniapp-warning-host-label"
    >
      <p
        id="miniapp-warning-host-label"
        class="text-xs font-bold uppercase tracking-wide text-space/50"
      >
        {{ $t('Web address') }}
      </p>
      <p
        data-test="hostname"
        class="font-mono text-base break-all leading-relaxed text-space"
      >
        <span
          v-for="(c, i) in analysis.hostChars"
          :key="`${i}-${c.codePoint}`"
          :class="charClass(c)"
        >{{ renderChar(c) }}</span>
      </p>
      <p class="text-xs text-space/60 font-mono break-all">
        {{ $t('Full link:') }} {{ url }}
      </p>
    </section>

    <section
      v-if="hasFlags"
      class="flex flex-col gap-3"
      :aria-label="$t('Why this address is flagged')"
    >
      <ul
        v-if="suspiciousChars.length"
        data-test="suspicious-chars"
        class="flex flex-col gap-1.5 text-sm text-space/80"
      >
        <li
          v-for="row in suspiciousChars"
          :key="`s-${row.position}-${row.codePoint}`"
          class="flex items-start gap-2"
        >
          <IonIcon :icon="warningOutline" aria-hidden="true" class="text-pumpkin shrink-0 mt-0.5" />
          <i18n-t keypath="Position {position}: {glyph} ({code}). {reason}." tag="span">
            <template #position>
              <strong>{{ row.position }}</strong>
            </template>
            <template #glyph>
              <span class="font-mono">«{{ row.glyph }}»</span>
            </template>
            <template #code>
              <span class="font-mono">{{ row.codePoint }}</span>
            </template>
            <template #reason>
              {{ row.reason }}
            </template>
          </i18n-t>
        </li>
      </ul>
      <ul
        v-if="generalWarnings.length"
        data-test="general-warnings"
        class="flex flex-col gap-1.5 text-sm text-space/80"
      >
        <li
          v-for="w in generalWarnings"
          :key="`g-${w}`"
          class="flex items-start gap-2"
        >
          <IonIcon :icon="warningOutline" aria-hidden="true" class="text-pumpkin shrink-0 mt-0.5" />
          <span>{{ w }}</span>
        </li>
      </ul>
    </section>

    <div class="flex flex-col gap-2 mt-2">
      <IonButton expand="block" fill="clear" color="danger" @click="confirm">
        {{ $t('Open anyway') }}
      </IonButton>
      <IonButton expand="block" color="primary" @click="cancel">
        {{ $t("Don't open") }}
      </IonButton>
    </div>
  </div>
</template>
