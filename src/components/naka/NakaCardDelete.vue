<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import LongPressButton from '@/components/LongPressButton.vue'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { nakaCardFromApi, useNaka } from '@/stores/naka'

const emit = defineEmits(stepEmits)

const MAX_BLOCKED_CARDS = 3 // TODO: get this from server
const { setCard, deactivateCardOnDevice } = useNaka()
const { card, cardBlockedCount } = storeToRefs(useNaka())

const loading = ref(false)

async function blockCard() {
  if (!card.value)
    return
  const { blockNakaCard } = useIssuerRestApi()
  loading.value = true
  // Blocking card on server
  const apiCard = await blockNakaCard(card.value.sourceId)
  // Removing card from device
  await deactivateCardOnDevice()
  // Updating store
  setCard(nakaCardFromApi(apiCard))
  useToast().setToast({
    message: i18n.t('Card blocked'),
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
    <div v-if="cardBlockedCount === MAX_BLOCKED_CARDS - 1" class="mb-4 text-center text-sm text-pumpkin">
      {{ $t('This is your last card. If you block it, you will need to contact support for a replacement.') }}
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
