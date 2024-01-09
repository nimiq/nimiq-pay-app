<script setup lang="ts">
import { IonButton, IonSpinner, IonToggle } from '@ionic/vue'
import { type PropType, computed, ref, watchEffect } from 'vue'
import { watchOnce } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import InfoIcon from '@/components/icons/info.vue'
import { type Flow, PaymentMethod, type PaymentRequestData, StepName, stepEmits } from '@/lib/flows/steps.types'
import { PointsState, usePointsPayment } from '@/composables/usePointsPayment'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import TransactionAmounts from '@/components/TransactionAmounts.vue'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { usePrice } from '@/composables/usePrice'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<Flow['state']>, required: true }, isVisible: { type: Boolean, required: true } })
const emit = defineEmits(stepEmits)

const { consensus } = storeToRefs(useNimiqNetwork())

const payment = computed<PaymentRequestData>(() => props.state[StepName.QRCodeScanner] as PaymentRequestData || { amount: 0, fee: 0, recipient: '' })
const amount = computed(() => payment.value.amount)
const fee = computed(() => payment.value.fee)
const rail = computed(() => payment.value.rail)
const recipient = computed(() => payment.value.recipient)
const railPeerId = computed(() => payment.value.railPeerId)

const { fiat, crypto } = usePrice(amount)
const { fiat: fiatFee } = usePrice(fee)

const canPayWithNim = computed(() => useRemoteSigner().remoteBalance >= payment.value.amount)

const { hasCashback, message: pointsMessage, pointsState, checkPointsPaymentValidity } = usePointsPayment({ fiatAmount: fiat.total, rail, recipient, reference: railPeerId })

const paymentMethod = ref<PaymentMethod>(PaymentMethod.NIM)
// pointsBalance === 0 && (!(isRemoteOk && isHtlcActive) || consensus !== 'established' || remoteBalance === 0)
const disabled = computed(() => !(pointsState.value === PointsState.Ok && paymentMethod.value === PaymentMethod.Points) && (!canPayWithNim.value || consensus.value !== 'established'))
const isPayingWithPointsForced = computed(() => !canPayWithNim.value && pointsState.value === PointsState.Ok)
const loading = ref(false)

watchEffect(() => {
  if (crypto.total > 0)
    checkPointsPaymentValidity()
})

watchOnce(isPayingWithPointsForced, () => {
  if (isPayingWithPointsForced.value)
    paymentMethod.value = PaymentMethod.Points
})

function handlePay() {
  if (loading.value)
    return

  loading.value = true
  emit('done', paymentMethod.value)
}
</script>

<template>
  <div class="flex flex-col items-center justify-center mt-8 gap-y-2">
    <TransactionAmounts :payment="payment">
      <template #fee>
        {{ $t('Fees might apply ~{fee}', { fee: fiatFee.formatted }) }}
      </template>
    </TransactionAmounts>

    <Transition name="slide-fade" mode="out-in">
      <!-- v-if="cashback && instantPayWallet.balanceRaw.value > (pendingPayment?.amount || 0)" -->
      <div
        v-if="hasCashback"
        class="flex items-baseline mt-8 font-semibold gap-x-1.5 transition-colors text-pretty text-center px-16"
        :class="{ '[&>*]:opacity-60 ': paymentMethod === PaymentMethod.Points }"
      >
        <InfoIcon class="w-6 stroke-2" />
        <p>{{ pointsMessage }}</p>
      </div>
    </Transition>
  </div>
  <div class="flex flex-col items-center w-full pb-6 mt-auto">
    <IonToggle
      v-if="canPayWithNim || pointsState === PointsState.Ok" :disabled="pointsState !== PointsState.Ok"
      label-placement="end" class="mb-4"
      :checked="isPayingWithPointsForced"
      @ion-change="(e) => e.detail.checked ? paymentMethod = PaymentMethod.Points : paymentMethod = PaymentMethod.NIM"
    >
      <i18n-t keypath="Use {amount}" tag="div" class="flex items-center text-lg font-semibold">
        <template #amount>
          <CryptoCityLogo class="w-5 h-5 ml-1.5 mr-1" />
          {{ crypto.total }}
        </template>
      </i18n-t>
    </IonToggle>

    <div class="mb-6 font-semibold text-center min-h-[4rem]">
      <Transition name="slide-fade" mode="out-in">
        <p v-if="!canPayWithNim && pointsState !== PointsState.Ok" class="text-pumpkin text-pretty">
          {{ $t('You don\'t have enough NIM for this purchase.') }}
        </p>
        <p v-else-if="pointsState === PointsState.InsufficientPoints" class="opacity-60text-pretty">
          {{ $t('You don\'t have enough Points for this purchase.') }}
        </p>
        <p v-else-if="pointsState === PointsState.NotEligibleForPayment" class="opacity-60 text-pretty">
          {{ $t('You can\'t pay with Points for this purchase.') }}
        </p>
        <p v-else-if="pointsState === PointsState.Error" class="text-pumpkin text-pretty">
          {{ pointsMessage }}
        </p>
        <p v-else-if="hasCashback" class="opacity-60 text-pretty">
          {{ $t('There is no cashback reward when paying with Points.') }}
        </p>
      </transition>
    </div>

    <IonButton size="large" expand="block" class="w-full" :disabled="disabled" @click="handlePay">
      <template v-if="loading">
        <IonSpinner class="text-white" name="dots" />
      </template>
      <template v-else>
        {{ $t('Pay') }}
      </template>
    </IonButton>
  </div>
</template>
