<script setup lang="ts">
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useNaka } from '@/stores/naka'
import { IonButton } from '@ionic/vue'
import LongPressButton from '../LongPressButton.vue'

defineProps<{ prop1: string }>()

const emit = defineEmits(stepEmits)

const isDev = import.meta.env.DEV

const { updateFrozenStatus } = useNaka()

function deleteCard() {
  updateFrozenStatus()
  emit('navigateTo', { step: StepName.NakaCardManagement })
}
</script>

<template>
  <div class="flex flex-col items-center h-full">
    <button v-if="isDev" class="absolute bottom-24 text-sky font-bold" @click="deleteCard">
      <!-- I am using firefox and the long press on phone does not work :upsidedown_smile: -->
      > Block fast (skips long press)
    </button>
    <LongPressButton :component="IonButton" class="mt-auto mb-4 block-btn w-full" @long-press="deleteCard">
      {{ $t('Block') }}
    </LongPressButton>
  </div>
</template>

<style scoped>
.block-btn {
  --background: var(--radial-gradient-orange);
  --padding-top: 0px;
  height: 64px;
  --padding-bottom: 0px;
}
</style>
