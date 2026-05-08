<script setup lang="ts">
import { Browser } from '@capacitor/browser'
import { IonButton, IonIcon, IonItem, IonList } from '@ionic/vue'
import { documentTextOutline } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { NumberFieldInput, NumberFieldRoot } from 'radix-vue'
import { ref, watch } from 'vue'
import LiveChatIcon from '@/components/icons/live-chat.vue'
import NakaCard from '@/components/naka/NakaCard.vue'
import QuickButton from '@/components/QuickButton.vue'
import { useLogger } from '@/composables/useLogger'
import { useModal } from '@/composables/useModal'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { isDev } from '@/lib'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits, StepName } from '@/lib/flows/steps.types'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { getDecryptedNakaCardData } from '@/lib/issuer-utils'
import { useApp } from '@/stores/app'
import { useLiveChat } from '@/stores/livechat'
import { nakaCardFromApi, useNaka } from '@/stores/naka'
import ArrowUpRightIcon from '../icons/arrow-up-right.vue'
import ChevronRightIcon from '../icons/chevron-right.vue'

defineEmits(stepEmits)

const logger = useLogger('NakaCardManagement.vue')

const { selectedFiat } = storeToRefs(useApp())
const { card, dailyLimit, paymentLimit, isCardActive, isCardLocked, isCardBlocked } = storeToRefs(useNaka())
const { issueNewCard } = useNaka()
const { getUserStatus } = useIssuerRestApi()
const { enabled: liveChatEnabled, shown: liveChatShown } = storeToRefs(useLiveChat())

const showSecretData = ref(false)
const cardData = ref<{ maskedPan: string, expiry: string } | { pan: string, expiry: string, cvc: string }>()
const evaluatingCardData = ref(false)
const lockingOrUnlockingCard = ref(false)

watch([card, showSecretData], async ([newCard, newShowSecretData]) => {
  if (!newCard) {
    cardData.value = undefined
    return
  }

  if (isCardBlocked.value) {
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

const newDailyLimit = ref<number>(dailyLimit.value?.amount || 0)
const newPaymentLimit = ref<number>(paymentLimit.value?.amount || 0)

async function lockCard() {
  if (!card.value)
    return
  const { lockNakaCard } = useIssuerRestApi()
  lockingOrUnlockingCard.value = true
  const apiCard = await lockNakaCard(card.value.sourceId)
  showSecretData.value = false
  card.value = nakaCardFromApi(apiCard)
  useToast().setToast({
    message: i18n.t('Card locked'),
  })
  lockingOrUnlockingCard.value = false
}

async function unlockCard() {
  if (!card.value)
    return
  const { unlockNakaCard } = useIssuerRestApi()
  lockingOrUnlockingCard.value = true
  const apiCard = await unlockNakaCard(card.value.sourceId)
  card.value = nakaCardFromApi(apiCard)
  useToast().setToast({
    message: i18n.t('Card unlocked'),
  })
  lockingOrUnlockingCard.value = false
}

function openLiveChat() {
  liveChatEnabled.value = true
  liveChatShown.value = true
  useModal().closeModal()
}

async function resetNaka() {
  if (!(await useNaka().reset()))
    return
  // Not translated, dev only
  useToast().setToast({ message: 'NAKA data reset' })
  useModal().closeModal()
}

async function handleCreateNewCard() {
  logger.log('Creating new card')
  try {
    const user = await getUserStatus()
    if (user.identifications.some(identification => identification.provider === 'NAKA-SUMSUB' && identification.status === 'VERIFIED')) {
      evaluatingCardData.value = true
      await issueNewCard(user)
      evaluatingCardData.value = false
    }
    else {
      throw new Error(i18n.t('Identification is not verified. Please contact support.'))
    }
  }
  catch (error) {
    evaluatingCardData.value = false
    logger.error('Error creating new NAKA Card:', error)
    useToast().setToast({
      type: 'error',
      message: (error as Error).message,
    })
  }
}
</script>

<template>
  <div class="flex flex-col h-full items-center w-full mx-auto">
    <NakaCard
      class="w-full h-max"
      :card-data="cardData"
      :loading-animation="evaluatingCardData || lockingOrUnlockingCard"
      :locked="isCardLocked"
      :blocked="isCardBlocked"
      @show-secret-data-change="showSecretData = !showSecretData"
    />

    <IonButton
      v-if="isCardBlocked"
      size="small" fill="clear" class="mt-8 text-base font-bold normal-case" style="--background: #1F23480D; --padding-top: 4px; --padding-bottom: 4px; --padding-start: 18px; --padding-end: 18px"
      @click="handleCreateNewCard"
    >
      {{ $t('Add new card') }}
    </IonButton>

    <div v-if="isCardActive" class="h-12" />

    <template v-if="isCardActive">
      <h2 class="text-[13px] font-bold tracking-wider uppercase text-space/60 lh-none self-start">
        {{ $t('Payment limits') }}
      </h2>

      <h3 class="text-space/40 text-sm mt-4 self-start">
        {{ $t('Daily limit') }}
      </h3>

      <form class="flex items-center gap-4 mt-1.5 w-full" @submit.prevent="() => setDailyLimit(Number(newDailyLimit), dailyLimit?.currency || selectedFiat)">
        <NumberFieldRoot
          v-model="newDailyLimit"
          :format-options="{
            style: 'currency',
            currency: dailyLimit?.currency || selectedFiat,
            currencyDisplay: 'symbol',
            compactDisplay: 'short',
            maximumFractionDigits: 0,
          }"
          as-child
        >
          <div role="group" class="flex-grow">
            <NumberFieldInput class="nq-input-box" />
          </div>
        </NumberFieldRoot>
        <button class="secondary" :disabled="isNaN(Number(newDailyLimit)) || Number(newDailyLimit) === dailyLimit?.amount">
          {{ $t('save') }}
        </button>
      </form>

      <h3 class="text-space/40 text-sm mt-4 self-start">
        {{ $t('Payment limit') }}
      </h3>

      <form class="flex items-center gap-4 mt-1.5 w-full" @submit.prevent="() => setPaymentLimit(Number(newPaymentLimit), paymentLimit?.currency || selectedFiat)">
        <NumberFieldRoot
          v-model="newPaymentLimit"
          :format-options="{
            style: 'currency',
            currency: paymentLimit?.currency || selectedFiat,
            currencyDisplay: 'symbol',
            compactDisplay: 'short',
            maximumFractionDigits: 0,
          }"
          as-child
        >
          <div role="group" class="flex-grow">
            <NumberFieldInput class="nq-input-box" />
          </div>
        </NumberFieldRoot>
        <button class="secondary" :disabled="isNaN(Number(newPaymentLimit)) || Number(newPaymentLimit) === paymentLimit?.amount">
          {{ $t('save') }}
        </button>
      </form>
    </template>

    <IonList lines="none" class="mt-10 w-full mb-auto">
      <IonItem style="--padding-start:0; --inner-padding-end:0;">
        <a class="flex items-center gap-2 text-space font-semibold w-full" @click="openLiveChat">
          <LiveChatIcon class="size-7" />
          {{ $t('Support') }}
          <ChevronRightIcon class="size-6 ml-auto" />
        </a>
      </IonItem>
      <IonItem style="--padding-start:0; --inner-padding-end:0;">
        <a class="flex items-center gap-2 w-full text-space font-semibold" @click="Browser.open({ url: 'https://rest.issuer.nimpay.app/public/Nimiq_NAKA_Card_TC.pdf', toolbarColor: '#0582CA' })">
          <IonIcon :icon="documentTextOutline" class="size-7" />
          {{ $t('Terms & Conditions') }}
          <ArrowUpRightIcon class="size-5 ml-auto" />
        </a>
      </IonItem>
    </IonList>

    <QuickButton v-if="isDev" show-chevron center class="mt-auto" @click="resetNaka">
      DEV: Reset NAKA
    </QuickButton>

    <IonButton v-if="isCardActive && !isCardLocked" class="mt-auto mb-4 w-full" :disabled="lockingOrUnlockingCard" @click="lockCard">
      {{ $t('Lock card') }}
    </IonButton>
    <IonButton v-else-if="isCardActive && isCardLocked" class="mt-auto mb-4 w-full" :disabled="lockingOrUnlockingCard" @click="unlockCard">
      {{ $t('Unlock card') }}
    </IonButton>

    <IonButton class="mb-4 delete-btn w-full" :disabled="isCardBlocked" @click="$emit('navigateTo', { step: StepName.NakaCardDelete })">
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
