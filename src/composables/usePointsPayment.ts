import { type MaybeRef, computed, ref, toValue } from 'vue'
import { usePointsApi } from './useApi'
import { useApp } from '@/stores/app'
import type { Rail } from '@/types/transactions'
import { usePoints } from '@/stores/points'
import { i18n } from '@/i18n/i18n-setup'

export enum PointsState {
  NotRegistered = 'not_registered',
  NotEligibleForPayment = 'not_eligible_for_payment',
  InsufficientPoints = 'insufficient_points',
  Loading = 'loading',
  Error = 'error',
  Eligible = 'eligible',
}

interface UsePointsPaymentOptions {
  recipient: MaybeRef<string>
  amount: MaybeRef<number>
  rail: MaybeRef<Rail | undefined>
  reference: MaybeRef<string | undefined>
}

export function usePointsPayment({ amount, rail, recipient, reference }: UsePointsPaymentOptions) {
  const pointsState = ref<PointsState>(PointsState.Loading)
  const cashback = ref<number>(0)
  const hasCashback = computed(() => cashback.value > 0)
  const message = ref<string>()

  /**
   * Checks if the payment is valid with points.
   *
   * If the payment is valid, it will set the cashback amount
   */
  async function checkPointsPaymentValidity() {
    if (toValue(amount) <= 0)
      return

    if (!useApp().pointsToken) {
      pointsState.value = PointsState.NotRegistered
      return
    }

    if (!toValue(rail) || !toValue(reference)) {
      pointsState.value = PointsState.NotEligibleForPayment
      message.value = i18n.t('This payment is not eligible for CC Points.')
      return
    }

    const { data, error } = await usePointsApi().verifyPayment({ recipient, reference: toValue(reference)!, token: useApp().pointsToken, rail: toValue(rail)! })
    if (error) {
      pointsState.value = PointsState.Error
      message.value = error
      return
    }

    if (usePoints().pointsBalance < toValue(amount)) {
      pointsState.value = PointsState.InsufficientPoints
      message.value = i18n.t('You don\'t have enough CC Points for this purchase.')
      return
    }

    const { cashback: { amountInLuna }, reason, valid } = data!
    if (!valid) {
      pointsState.value = PointsState.Error
      message.value = reason
      return
    }

    cashback.value = amountInLuna
    message.value = i18n.t('This purchase gets you {amount} in Points.', { amount: (amountInLuna / 1e5).toFixed(2) })
    pointsState.value = PointsState.Eligible
  }

  return {
    checkPointsPaymentValidity,
    pointsState,
    cashback,
    hasCashback,
    message,
    isEligible: computed(() => pointsState.value === PointsState.Eligible),
  }
}
