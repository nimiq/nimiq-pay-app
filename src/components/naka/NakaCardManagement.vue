<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import InputText from '@/components/InputText.vue'
import NakaCard from '@/components/naka/NakaCard.vue'
import QuickButton from '@/components/QuickButton.vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useModal } from '@/composables/useModal'
import { useToast } from '@/composables/useToast'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits, StepName } from '@/lib/flows/steps.types'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { getDecryptedNakaCardData } from '@/lib/issuer-utils'
import { useApp } from '@/stores/app'
import { nakaCardFromApi, useNaka } from '@/stores/naka'

defineEmits(stepEmits)

const { selectedFiat } = storeToRefs(useApp())
const { card, dailyLimit, paymentLimit, isCardActive, isCardLocked } = storeToRefs(useNaka())

const showSecretData = shallowRef(false)
const cardData = shallowRef<{ maskedPan?: string, pan?: string, expiry: string, cvv?: string } | undefined>(undefined)
const evaluatingCardData = shallowRef(false)

watch([card, showSecretData], async ([newCard, newShowSecretData]) => {
  if (!newCard) {
    cardData.value = undefined
    return
  }

  evaluatingCardData.value = true
  try {
    if (newShowSecretData) {
      // Open PIN flow and wait for confirmation, if cancelled, do not show secret data
      const modal = await initializeFlow(FlowName.AskForPin, { isOnTop: true })
      const { role } = await modal.onWillDismiss()
      if (role !== 'confirm') {
        showSecretData.value = false
        return
      }
      cardData.value = await getDecryptedNakaCardData(newCard.sourceId)
    }
    else {
      cardData.value = { maskedPan: newCard.maskedPan, expiry: `${newCard.expiry.month}/${newCard.expiry.year.toString(10).substring(2, 4)}` }
    }
  }
  finally {
    evaluatingCardData.value = false
  }
}, { immediate: true })

const { setDailyLimit, setPaymentLimit } = useNaka()
const { formatFiatToParts } = useCurrencyFormatter()

const newDailyLimit = (() => {
  if (!dailyLimit.value) {
    return ref<string>('')
  }
  const parts = formatFiatToParts(dailyLimit.value.amount, { currency: dailyLimit.value.currency })
  return ref<string>(parts.filter(part => part.type === 'integer').map(part => part.value).join(''))
})()

const newPaymentLimit = (() => {
  if (!paymentLimit.value) {
    return ref<string>('')
  }
  const parts = formatFiatToParts(paymentLimit.value.amount, { currency: paymentLimit.value.currency })
  return ref<string>(parts.filter(part => part.type === 'integer').map(part => part.value).join(''))
})()

async function lockCard() {
  if (!card.value)
    return
  const { lockNakaCard } = useIssuerRestApi()
  // TODO: Button loading state
  const apiCard = await lockNakaCard(card.value.sourceId)
  card.value = nakaCardFromApi(apiCard)
  useToast().setToast({
    message: 'Card locked',
  })
}

async function unlockCard() {
  if (!card.value)
    return
  const { unlockNakaCard } = useIssuerRestApi()
  // TODO: Button loading state
  const apiCard = await unlockNakaCard(card.value.sourceId)
  card.value = nakaCardFromApi(apiCard)
  useToast().setToast({
    message: 'Card unlocked',
  })
}

async function resetNaka() {
  if (!(await useNaka().reset()))
    return
  useToast().setToast({ message: 'NAKA data reset' })
  useModal().closeModal()
}
</script>

<template>
  <div class="flex flex-col h-full items-center w-max mx-auto">
    <NakaCard class="w-full h-max" :card-data="cardData" :loading-animation="evaluatingCardData" @show-secret-data-change="showSecretData = !showSecretData" />

    <!-- <div class="mt-8 flex items-center gap-6">
      <button v-if="!isCardActive" class="secondary" @click="createNewCard">
        {{ $t('Add new card') }}
      </button>
    </div> -->

    <div v-if="isCardActive" class="h-12" />

    <template v-if="isCardActive">
      <h2 class="text-[13px] font-bold tracking-wider uppercase text-space/60 lh-none self-start">
        {{ $t('Payment limits') }}
      </h2>

      <h3 class="text-space/40 text-sm mt-4 self-start">
        {{ $t('Daily limit') }}
      </h3>

      <form class="flex items-center gap-4 mt-1.5" @submit.prevent="() => setDailyLimit(Number(newDailyLimit), dailyLimit?.currency || selectedFiat)">
        {{ dailyLimit?.currency || selectedFiat }}
        <InputText v-model="newDailyLimit" min="0" class="w-1/2" type="number" inputmode="numeric" placeholder="0" />
        <button class="secondary" :disabled="isNaN(Number(newDailyLimit)) || Number(newDailyLimit) === dailyLimit?.amount">
          {{ $t('save') }}
        </button>
      </form>

      <h3 class="text-space/40 text-sm mt-4 self-start">
        {{ $t('Payment limit') }}
      </h3>

      <form class="flex items-center gap-4 mt-1.5" @submit.prevent="() => setPaymentLimit(Number(newPaymentLimit), paymentLimit?.currency || selectedFiat)">
        {{ paymentLimit?.currency || selectedFiat }}
        <InputText v-model="newPaymentLimit" min="0" class="w-1/2" type="text" inputmode="numeric" placeholder="0" />
        <button class="secondary" :disabled="isNaN(Number(newPaymentLimit)) || Number(newPaymentLimit) === paymentLimit?.amount">
          {{ $t('save') }}
        </button>
      </form>
    </template>

    <!-- <IonList lines="none" class="mt-10 w-full mb-16">
      <IonItem style="--padding-start:0">
        <a class="flex items-center gap-2 text-space font-semibold w-full" @click="Browser.open({ url: 'https://nimiq.com', toolbarColor: '#0582CA' })">
          <i-nimiq-help />
          {{ $t('Support') }}
          <i-nimiq-chevron-right class="ml-auto text-xs " />
        </a>
      </IonItem>
      <IonItem style="--padding-start:0">
        <a class="flex items-center gap-2 w-full text-space font-semibold" @click="Browser.open({ url: 'https://nimiq.com', toolbarColor: '#0582CA' })">
          <i-nimiq-file-text class="text-[18px]" />
          {{ $t('Terms and conditions') }}
          <i-nimiq-chevron-right class="ml-auto text-xs " />
        </a>
      </IonItem>
    </IonList> -->

    <QuickButton show-chevron center @click="resetNaka">
      DEV: Reset NAKA
    </QuickButton>

    <IonButton v-if="isCardActive && !isCardLocked" class="mt-auto mb-4 w-full" @click="lockCard">
      {{ $t('Lock card') }}
    </IonButton>
    <IonButton v-else-if="isCardActive && isCardLocked" class="mt-auto mb-4 w-full" @click="unlockCard">
      {{ $t('Unlock card') }}
    </IonButton>

    <IonButton v-if="isCardActive" class="mb-4 delete-btn w-full" @click="$emit('navigateTo', { step: StepName.NakaCardDelete })">
      {{ $t('Block card') }}
    </IonButton>
  </div>
</template>

<style scoped>
button.secondary {
  background: rgba(31, 35, 72, 0.06);
  @apply px-4 py-1.5 rounded-full text-sm text-space font-bold;

  &:disabled {
    opacity: 0.6;
  }
}

.delete-btn {
  --background: var(--radial-gradient-orange);
}
</style>
