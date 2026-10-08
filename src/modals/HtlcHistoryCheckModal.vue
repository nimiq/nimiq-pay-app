<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { useNow } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import CircularProgress from '@/components/icons/CircularProgress.vue'
import WorldIcon from '@/components/icons/WorldIcon.vue'
import { useModal } from '@/composables/useModal'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { HTLC_HISTORY_CHECK_HOLD_MS, useSync } from '@/stores/sync'

const { closeModal } = useModal()
const { consensus } = storeToRefs(useNimiqNetwork())
const { htlcHistoryChecked, htlcCheckHoldStartedAt } = storeToRefs(useSync())

const now = useNow({ interval: 1000 })
const maxProgress = HTLC_HISTORY_CHECK_HOLD_MS / 1000
const progress = computed(() => {
  const startedAt = htlcCheckHoldStartedAt.value ?? now.value.getTime()
  return Math.min(maxProgress, Math.max(0, Math.floor((now.value.getTime() - startedAt) / 1000)))
})

// The check passing marks it checked; the hold ending (limit, funded HTLC, no local funds) clears the start.
const isReleased = computed(() => htlcHistoryChecked.value || htlcCheckHoldStartedAt.value === undefined)

const content = ref<HTMLElement>()
// Ionic mounts contents before presentation, so getTop() can still return an underlying modal.
let selfModal: HTMLIonModalElement | undefined
onMounted(() => {
  selfModal = content.value?.closest('ion-modal') ?? undefined
  // The hold may end while this modal is still loading, before the watcher exists.
  if (isReleased.value && selfModal)
    closeModal({ modal: selfModal })
})

watch(isReleased, (released) => {
  // Before onMounted pins selfModal, closeModal would dismiss whatever is on top; onMounted re-checks.
  if (released && selfModal)
    closeModal({ modal: selfModal })
})

const minutesLeft = computed(() => Math.max(1, Math.ceil((maxProgress - progress.value) / 60)))
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="closeModal({ modal: selfModal })">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <div ref="content" class="flex flex-col items-center h-full p-8 pt-0 gap-4">
    <h1 class="text-2xl font-bold text-center">
      {{ $t('Checking your account') }}
    </h1>
    <h2 class="text-lg font-normal text-space/60 text-pretty text-center">
      {{ $t('Before securing new funds, Nimiq Pay checks your account history so no earlier deposit is left behind. Your funds stay safe in your wallet meanwhile. This can take up to {minutes} minutes.', { minutes: maxProgress / 60 }) }}
    </h2>
    <div class="py-8 flex flex-col items-center gap-3">
      <CircularProgress v-if="consensus === 'established'" :value="progress" :max="maxProgress" class="size-16" />
      <WorldIcon v-else class="size-[60px]" />
      <span class="text-space/50 font-semibold">{{ consensus === 'established' ? $t('{minutes} min left at most', { minutes: minutesLeft }) : $t('Establishing consensus') }}</span>
    </div>
  </div>
</template>
