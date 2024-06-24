import { i18n } from '../i18n/i18n-setup'

import type { PaymentRequestData } from '../lib/flows/steps.types'
import type { PaymentMethod } from '../types/transactions'
import { useLogger } from './useLogger'

const logger = useLogger('composables/usePayment.ts')

export function usePayment() {
  return {
    makePayment,
  }
}

export async function makePayment(method: PaymentMethod, request: PaymentRequestData, err: (msg: string) => void) {
  const { markAsUnknownTransactionTitle, PaymentMethod } = await import('@/types/transactions')

  logger.log(`🤑  Initializing payment process with ${method}`, request)

  if (method === PaymentMethod.NIM) {
    const { useTransactions } = await import('@/stores/transactions')
    const { error } = await useTransactions().sendTx({
      ...request,
      title: request.merchantName
        ? markAsUnknownTransactionTitle(request.merchantName)
        : 'Payment', // translated at display time
    }).catch(error => ({ error: i18n.t(
      'Transaction failed: {error}',
      { error: error instanceof Error ? error.message : String(error) },
    ) }))
    if (error) {
      err(error)
      return false
    }
  }
  else if (method === PaymentMethod.Points) {
    if (!request.rail || !request.paymentRef)
    // No translation as not user-facing. Dev error which should not occur in production.
      throw new Error(`You cannot pay with points without a rail nor paymentRef. Request: ${JSON.stringify(request)}`)

    const { usePoints } = await import('@/stores/points')
    const { error } = await usePoints().payWithPoints(request)
    if (error) {
      err(error)
      return false
    }
  }

  const { useToast } = await import('@/composables/useToast')
  useToast().setToast({ message: i18n.t('Payment successful') })
  return true
}
