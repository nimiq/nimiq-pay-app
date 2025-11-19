<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import LongPressButton from '@/components/LongPressButton.vue'
import { useToast } from '@/composables/useToast'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { nakaCardFromApi, useNaka } from '@/stores/naka'

defineProps<{ prop1: string }>()

const emit = defineEmits(stepEmits)

const { card } = storeToRefs(useNaka())

const loading = ref(false)

async function blockCard() {
  if (!card.value)
    return
  const { blockNakaCard } = useIssuerRestApi()
  loading.value = true
  const apiCard = await blockNakaCard(card.value.sourceId)
  card.value = nakaCardFromApi(apiCard)
  useToast().setToast({
    message: 'Card blocked',
  })
  loading.value = false
  emit('navigateTo', { step: StepName.NakaCardManagement })
}
</script>

<template>
  <div class="flex flex-col items-center h-full">
    <div class="mt-auto mb-4 font-medium text-space/60">
      {{ $t('Hold the button to confirm.') }}
    </div>
    <LongPressButton :component="IonButton" class="mb-4 block-btn w-full" :disabled="loading" @long-press="blockCard">
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
