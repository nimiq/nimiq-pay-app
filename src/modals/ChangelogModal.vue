<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { onMounted } from 'vue'
import ChangelogEntry from '@/components/ChangelogEntry.vue'
import ChevronRight from '@/components/icons/chevron-right.vue'
import SparklesIcon from '@/components/icons/sparkles.vue'
import { useChangelog } from '@/composables/useChangelog'
import { useModal } from '@/composables/useModal'

const { closeModal } = useModal()
const { latest, previous, resolveVersion, markChangelogSeen } = useChangelog()

// Opening the changelog counts as seeing it, so the home card stops appearing.
onMounted(async () => {
  await resolveVersion()
  markChangelogSeen()
})
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton :aria-label="$t('Close')" @click.stop="closeModal()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>

  <IonContent>
    <div class="px-5 pt-1 pb-10 text-left">
      <div class="flex items-center gap-2 text-sky">
        <SparklesIcon class="w-6 h-6 shrink-0" />
        <h1 class="text-2xl font-bold text-space">
          {{ $t('What\'s New') }}
        </h1>
      </div>

      <template v-if="latest">
        <!-- Latest version, always expanded -->
        <ChangelogEntry :entry="latest" class="mt-6" />

        <!-- Older versions, hidden until requested -->
        <CollapsibleRoot v-if="previous.length" class="mt-8">
          <CollapsibleTrigger class="collapsible-trigger flex w-full items-center justify-between border-t border-ash py-4 text-left">
            <span class="text-base font-bold text-space">{{ $t('Previous versions') }}</span>
            <ChevronRight class="chevron w-4 h-5 text-space/50" />
          </CollapsibleTrigger>
          <CollapsibleContent class="collapsible-content">
            <div class="flex flex-col gap-8 pt-2 pb-1">
              <ChangelogEntry v-for="entry in previous" :key="entry.version" :entry="entry" compact />
            </div>
          </CollapsibleContent>
        </CollapsibleRoot>
      </template>

      <p v-else class="mt-8 text-base text-space/60">
        {{ $t('No changelog yet. Check back after the next update.') }}
      </p>
    </div>
  </IonContent>
</template>

<style scoped>
/* Chevron points right when closed, rotates down when the section opens. */
.chevron {
  transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.collapsible-trigger[data-state='open'] .chevron {
  transform: rotate(90deg);
}

/* Height animation driven by Reka's measured content height. */
.collapsible-content {
  overflow: hidden;
}
.collapsible-content[data-state='open'] {
  animation: collapsible-down 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.collapsible-content[data-state='closed'] {
  animation: collapsible-up 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes collapsible-down {
  from { height: 0; }
  to { height: var(--reka-collapsible-content-height); }
}
@keyframes collapsible-up {
  from { height: var(--reka-collapsible-content-height); }
  to { height: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .chevron,
  .collapsible-content[data-state] {
    animation: none;
    transition: none;
  }
}
</style>
