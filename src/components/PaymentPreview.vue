<script setup lang="ts">
import { IonButton, IonToggle } from '@ionic/vue'
import { type PropType, computed, ref } from 'vue'
import { computedAsync } from '@vueuse/core'
import InfoIcon from '@/components/icons/info.vue'
import type { Flow, PaymentRequestData } from '@/types/steps'
import { PaymentMethod, StepName, stepEmits } from '@/types/steps'
import { useFiat } from '@/stores/fiat'
import { PointsState, usePointsPayment } from '@/composables/usePointsPayment'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import TransactionAmounts from '@/components/TransactionAmounts.vue'
import { useRemoteSigner } from '@/stores/remote-signer'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<Flow['state']>, required: true } })
const emit = defineEmits(stepEmits)

const { getPriceNow, formatFiat, formatCrypto } = useFiat()

// TODO Check error from API
const priceNow = computedAsync(() => getPriceNow().then(({ data }) => data!))

const payment = computed<PaymentRequestData>(() => props.state[StepName.QRCodeScanner] as PaymentRequestData || { amount: 0, fee: 0, recipient: '' })

const nimAmount = computed(() => payment.value.amount / 1e5)
const feeNimAmount = computed(() => payment.value.fee / 1e5)
const fiatAmount = computed(() => nimAmount.value * priceNow.value)
const fiatFee = computed(() => feeNimAmount.value * priceNow.value)
const canPayWithNim = computed(() => useRemoteSigner().remoteBalance >= payment.value.amount)
const rail = computed(() => payment.value.rail)
const recipient = computed(() => payment.value.recipient)
const message = computed(() => payment.value.message)

const { cashback, hasCashback, message: pointsMessage, pointsState } = usePointsPayment({ fiatAmount, rail, recipient, reference: message })

const paymentMethod = ref<PaymentMethod>(PaymentMethod.NIM)
</script>

<template>
  <div class="flex flex-col items-center justify-center mt-8 gap-y-2">
    <TransactionAmounts :payment="payment">
      <template #fee>
        Fees might apply {{ feeNimAmount > 0 ? '~' : '' }}{{ formatFiat(fiatFee) }}
      </template>
    </TransactionAmounts>

    <Transition name="slide-fade" mode="out-in">
      <!-- v-if="cashback && instantPayWallet.balanceRaw.value > (pendingPayment?.amount || 0)" -->
      <div
        v-if="hasCashback"
        class="flex items-baseline mt-8 font-semibold gap-x-1.5 transition-colors [text-wrap:pretty] text-center px-16"
        :class="{ 'text-space/60': paymentMethod === PaymentMethod.Points }"
      >
        <InfoIcon class="w-6 stroke-2" />
        <p>This purchase gets you {{ formatFiat(cashback) }} in CC Points.</p>
      </div>
    </Transition>
  </div>
  <div class="flex flex-col items-center w-full pb-6 mt-auto">
    <IonToggle
      v-if="canPayWithNim || pointsState === PointsState.Ok" :disabled="pointsState !== PointsState.Ok"
      label-placement="end" class="mb-4"
      @ion-change="() => paymentMethod = PaymentMethod.Points"
    >
      <div class="flex items-center text-lg">
        <span class="mr-1.5">Use</span>
        <CryptoCityLogo class="w-5 h-5 mr-1" />
        <span>{{ formatCrypto(nimAmount, 'NIM') }}</span>
      </div>
    </IonToggle>

    <div class="mb-6 font-semibold text-center">
      <Transition name="slide-fade" mode="out-in">
        <p v-if="!canPayWithNim && pointsState !== PointsState.Ok" class="text-pumpkin [text-wrap:pretty]">
          You don't have enough NIM for this purchase.
        </p>
        <p v-else-if="pointsState === PointsState.InsufficientPoints" class="text-space/60 [text-wrap:pretty]">
          You don't have enough CC Points for this purchase.
        </p>
        <p v-else-if="pointsState === PointsState.NotEligibleForPayment" class="text-space/60 [text-wrap:pretty]">
          You can't pay with CC Points for this purchase.
        </p>
        <p v-else-if="pointsState === PointsState.Error" class="text-pumpkin [text-wrap:pretty]">
          {{ pointsMessage }}
        </p>
        <p v-else-if="!hasCashback" class="text-space/60">
          There is no cashback reward when paying with CC Points.
        </p>
      </transition>
    </div>

    <IonButton size="large" expand="block" class="w-full" @click="emit('done', paymentMethod)">
      Pay
    </IonButton>
  </div>
</template>
