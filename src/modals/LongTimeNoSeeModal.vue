<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { watchDebounced } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import CircularProgress from '@/components/icons/CircularProgress.vue'
import WorldIcon from '@/components/icons/WorldIcon.vue'
import { useModal } from '@/composables/useModal'
import { debounceDelay, debounceMaxWait } from '@/lib'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSync } from '@/stores/sync'

const { closeModal } = useModal()
const { consensus } = storeToRefs(useNimiqNetwork())
const { isHtlcRecreating, hasHtlcExpired, isHtlcActive } = storeToRefs(useRemoteSigner())
const { blocksUntilNextMacroBlock } = storeToRefs(useSync())

watchDebounced([consensus, isHtlcRecreating], () => {
  if (consensus.value === 'established' && hasHtlcExpired.value === false && isHtlcActive.value)
    closeModal()
}, { immediate: true, debounce: debounceDelay, maxWait: debounceMaxWait })

const maxProgress = Nimiq.Policy.BLOCKS_PER_BATCH
const isCompleted = ref(false)
const progress = computed(() => {
  if (isCompleted.value)
    return maxProgress
  return !isHtlcActive.value && hasHtlcExpired.value === false ? maxProgress - blocksUntilNextMacroBlock.value : 0
})
// Only show completed one time, then wait for closeModal
watch(progress, (progress) => {
  if (progress >= maxProgress && hasHtlcExpired.value === false)
    isCompleted.value = true
}, { immediate: true })
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="() => closeModal()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <div class="flex flex-col items-center h-full p-8 pt-0 gap-4">
    <h1 class="text-2xl font-bold text-center">
      {{ $t('Updating connection') }}
    </h1>
    <h2 class="text-lg font-normal text-space/60 text-pretty text-center">
      {{ $t('After being disconnected for a while, the network connection needs to refresh. This can take up to 60 sec.') }}
    </h2>
    <div class="py-8 flex flex-col items-center gap-3">
      <CircularProgress v-if="consensus === 'established'" :value="progress" :max="maxProgress" class="size-16" />
      <WorldIcon v-else class="size-[60px]" />
      <span class="text-space/50 font-semibold">{{ consensus === 'established' ? $t('Refreshing connection') : $t('Establishing consensus') }}</span>
    </div>
  </div>
</template>
