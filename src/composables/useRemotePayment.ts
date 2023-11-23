import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useFirestoreApi, usePointsApi } from './useApi'
import { TransactionStatus, TransactionType } from '@/types/transactions'
import { useRemoteSigner } from '@/stores/remote-signer'
import type { AsyncOption } from '@/types'

export enum PaymentRail {
  None = 'none',
  CryptoPaymentLink = 'cpl',
  GoCrypto = 'go_crypto',
}

interface BasePendingPayment {
  address: Nimiq.Address
  value: number
  fee: number
  fiatAmount?: number
  fiatUnit?: string
  message?: string
  details?: string
  label?: string
}
export type WithoutRailPendingPayment = BasePendingPayment & {
  paymentType: PaymentRail.None
}

export type RailPendingPayment = BasePendingPayment & {
  paymentType: PaymentRail.CryptoPaymentLink | PaymentRail.GoCrypto
  rail: string
  railId: string
  railPeerId: string
}

export type PendingPayment = WithoutRailPendingPayment | RailPendingPayment

export function useRemotePayment() {
  const payment = ref<PendingPayment>()

  const { getOrderById } = useFirestoreApi()
  const { payWithPoints } = usePointsApi()
  const { insertTx } = useTxDatabase()
  const { remoteIsReady } = useRemoteSigner()
  const { wallet } = storeToRefs(useRemoteSigner())

  // TODO This can be a watch and just set the payment value info from the firestore if needed
  async function prepare(newPayment: PendingPayment) {
    if (newPayment.paymentType === PaymentRail.None || newPayment.paymentType === PaymentRail.GoCrypto) {
      payment.value = newPayment
    }
    else if (newPayment.paymentType === PaymentRail.CryptoPaymentLink) {
      const { data, error } = await getOrderById({ id: newPayment.railId })
      if (error)
        throw new Error(error)
      payment.value = {
        ...newPayment,
        fiatUnit: data!.fields.fiat_currency_code.stringValue,
        fiatAmount: data!.fields.fiat_price.doubleValue,
        details: data!.fields.item_description.stringValue,
      }
    }
  }

  async function completeWithBonus(payment: RailPendingPayment): AsyncOption<string> {
    const { error } = await payWithPoints({
      destination: payment.address.toUserFriendlyAddress(),
      reference: payment.railId || payment.message,
      type: payment.rail,
    })
    if (error)
      return 'Payment with points failed'
    const errorInsert = await insertTx({
      id: crypto.getRandomValues(new Uint8Array(16)).join(''),
      type: TransactionType.Payment,
      ts: Date.now() / 1000,
      status: TransactionStatus.Unknown,
      wlId: 'bonus',
      peerId: payment.address.toUserFriendlyAddress(),
      peerName: payment.label,
      ...payment,
    })
    return errorInsert
  }

  async function completeWithNim(payment: PendingPayment) {
  }

  return {
    prepare,
  }
}
