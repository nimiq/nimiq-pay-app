<script setup lang="ts">
import { Browser } from '@capacitor/browser'
import { IonButton, IonItem, IonList } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import CardDetails from '@/components/CardDetails.vue'
import InputText from '@/components/InputText.vue'
import NakaCard from '@/components/naka/NakaCard.vue'
import QuickButton from '@/components/QuickButton.vue'
import { useModal } from '@/composables/useModal'
import { useToast } from '@/composables/useToast'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { nakaCardFromApi, useNaka } from '@/stores/naka'

defineEmits(stepEmits)

const { card, dailyLimit, paymentLimit, isCardActive, isCardLocked } = storeToRefs(useNaka())
const { setDailyLimit, setPaymentLimit } = useNaka()
const newDailyLimit = ref<number | undefined>(dailyLimit.value)
const newPaymentLimit = ref<number | undefined>(paymentLimit.value)

const showCardDetails = ref(false)

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
    <NakaCard class="w-full h-max" />

    <div class="mt-8 flex items-center gap-6">
      <button v-if="isCardActive" class="secondary" @click="showCardDetails = !showCardDetails">
        {{ showCardDetails ? $t('Hide details') : $t('Show details') }}
      </button>
      <!-- <button v-else class="secondary" @click="createNewCard">
        {{ $t('Add new card') }}
      </button> -->
    </div>

    <div v-if="isCardActive" class="h-12" />

    <CardDetails
      v-if="isCardActive"
      :show="showCardDetails" :card-number="card?.cardNumber" :cvc="card?.cvc"
      :expiry="card?.expiry"
    />

    <template v-if="isCardActive">
      <h2 class="text-[13px] font-bold tracking-wider uppercase text-space/60 lh-none self-start">
        {{ $t('Payment limits') }}
      </h2>

      <h3 class="text-space/40 text-sm mt-4 self-start">
        {{ $t('Daily limit') }}
      </h3>

      <form class="flex items-center gap-4 mt-1.5" @submit.prevent="() => setDailyLimit(newDailyLimit)">
        <InputText v-model="newDailyLimit" min="0" class="w-1/2" placeholder="0,00" type="number" />
        <button class="secondary" :disabled="!newDailyLimit?.value || newDailyLimit?.value === dailyLimit.value">
          {{ $t('save') }}
        </button>
      </form>

      <h3 class="text-space/40 text-sm mt-4 self-start">
        {{ $t('Payment limit') }}
      </h3>

      <form class="flex items-center gap-4 mt-1.5" @submit.prevent="() => setPaymentLimit(newPaymentLimit)">
        <InputText v-model="newPaymentLimit" min="0" class="w-1/2" type="number" placeholder="0,00" />
        <button class="secondary" :disabled="!newPaymentLimit?.value || newPaymentLimit?.value === paymentLimit.value">
          {{ $t('save') }}
        </button>
      </form>
    </template>

    <IonList lines="none" class="mt-10 w-full mb-16">
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
    </IonList>

    <QuickButton show-chevron center @click="resetNaka">
      dev: Reset NAKA
    </QuickButton>

    <IonButton v-if="isCardActive && !isCardLocked" class="mt-auto mb-4 w-full" @click="lockCard">
      {{ $t('Lock card') }}
    </IonButton>
    <IonButton v-else-if="isCardActive && isCardLocked" class="mt-auto mb-4 w-full" @click="unlockCard">
      {{ $t('Unlock card') }}
    </IonButton>

    <IonButton v-if="isCardActive" class="mt-auto mb-4 delete-btn w-full" @click="$emit('navigateTo', { step: StepName.NakaCardDelete })">
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
