<script setup lang="ts">
import CardDetails from '@/components/CardDetails.vue'
import NakaCard from '@/components/icons/naka-card.vue'
import InputText from '@/components/InputText.vue'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useNaka } from '@/stores/naka'
import { IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

defineEmits(stepEmits)

const { dailyLimit, paymentLimit } = storeToRefs(useNaka())
const { card, setDailyLimit, setPaymentLimit } = useNaka()
const newDailyLimit = ref(dailyLimit.value)
const newPaymentLimit = ref(paymentLimit.value)

const showCardDetails = ref(false)
</script>

<template>
  <div class="flex flex-col h-full">
    <NakaCard class="w-[calc(100vw-128px)] h-max" />

    <div class="mt-8 flex items-center gap-6">
      <button class="secondary" @click="showCardDetails = !showCardDetails">
        {{ showCardDetails ? $t('Hide details') : $t('Show details') }}
      </button>
      <button class="secondary" @click="$emit('navigateTo', { step: StepName.NakaCardToggleFreeze })">
        {{ $t('Freeze card') }}
      </button>
    </div>

    <Transition
      enter-from-class="h-0" enter-active-class="transition-all duration-500 ease-out" enter-to-class="h-[133px]"
      leave-from-class="h-[133px]" leave-active-class="transition-all duration-500 ease-out" leave-to-class="h-0"
    >
      <CardDetails v-if="showCardDetails" class="of-clip mt-12" :card-number="card?.cardNumber" :cvv="card?.cvv" :expiry-date="card?.expiryDate" />
    </Transition>

    <h2 class="mt-12 text-[13px] font-bold tracking-wider uppercase text-space/60 lh-none">
      {{ $t('Payment limits') }}
    </h2>

    <h3 class="text-space/40 text-sm mt-4">
      {{ $t('Daily limit') }}
    </h3>

    <form class="flex items-center gap-4 mt-1.5" @submit.prevent="() => setDailyLimit(newDailyLimit)">
      <InputText v-model="newDailyLimit" class="w-1/2" placeholder="0,00" type="number" />
      <button class="secondary" :disabled="!newDailyLimit.value || newDailyLimit.value === dailyLimit.value">
        {{ $t('save') }}
      </button>
    </form>

    <h3 class="text-space/40 text-sm mt-4">
      {{ $t('Payment limit') }}
    </h3>

    <form class="flex items-center gap-4 mt-1.5" @submit.prevent="() => setPaymentLimit(newPaymentLimit)">
      <InputText v-model="newPaymentLimit" class="w-1/2" type="number" placeholder="0,00" />
      <button class="secondary" :disabled="!newPaymentLimit.value || newPaymentLimit.value === paymentLimit.value">
        {{ $t('save') }}
      </button>
    </form>

    <IonButton class="mt-auto mb-2 block-btn" @click="$emit('navigateTo', { step: StepName.NakaCardDelete })">
      {{ $t('Block') }}
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

:global(button.block-btn) {
  --background: var(--radial-gradient-orange);
}
</style>
