<script setup lang="ts">
import CardDetails from '@/components/CardDetails.vue'
import NakaCard from '@/components/icons/naka-card.vue'
import InputText from '@/components/InputText.vue'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useNaka } from '@/stores/naka'
import { IonButton, IonItem, IonList, IonSelect, IonSelectOption } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

defineEmits(stepEmits)

const { dailyLimit, paymentLimit, isBlocked } = storeToRefs(useNaka())
const { card, setDailyLimit, setPaymentLimit } = useNaka()
const newDailyLimit = ref<number | undefined>(dailyLimit.value)
const newPaymentLimit = ref<number | undefined>(paymentLimit.value)

const showCardDetails = ref(false)
</script>

<template>
  <div class="flex flex-col h-full items-center w-max mx-auto">
    <NakaCard class="w-full h-max" />

    <div class="mt-8 flex items-center gap-6 mb-12">
      <template v-if="!isBlocked">
        <button class="secondary" @click="showCardDetails = !showCardDetails">
          {{ showCardDetails ? $t('Hide details') : $t('Show details') }}
        </button>
        <button class="secondary" @click="$emit('navigateTo', { step: StepName.NakaCardToggleFreeze })">
          {{ $t('Freeze card') }}
        </button>
      </template>
      <button v-else class="secondary">
        {{ $t('Add new card') }}
      </button>
    </div>

    <CardDetails
      v-if="!isBlocked"
      :show="showCardDetails" :card-number="card?.cardNumber" :cvv="card?.cvv"
      :expiry-date="card?.expiryDate"
    />

    <template v-if="!isBlocked">
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

    <IonList lines="none" class="mt-10 w-full">
      <!-- <IonItem>
        <a @click="Browser.open({ url: JSON.stringify(__NAKA_SUPPORT_URL__), toolbarColor: '#0582CA' })">
          {{ $t('Support') }}
        </a>
      </IonItem>
      <IonItem>
        <a @click="Browser.open({ url: JSON.stringify(__NAKA_TERM_AND_CONDITIONS_URL__), toolbarColor: '#0582CA' })">
          {{ $t('Terms and conditions') }}
        </a>
      </IonItem> -->
    </IonList>

    <IonButton v-if="!isBlocked" class="mt-auto mb-4 block-btn w-full" @click="$emit('navigateTo', { step: StepName.NakaCardDelete })">
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

.block-btn {
  --background: var(--radial-gradient-orange);
}
</style>
