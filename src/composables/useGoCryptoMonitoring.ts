// This composable is not part of useGoCrypto as it includes some input options and output processing specific to Nimiq
// Pay app, and composition api code specific to Vue, while the idea is to keep useGoCrypto generic, and to eventually
// move it into its own library/package.
import { type MaybeRef, getCurrentScope, onScopeDispose, ref, toValue, watch } from 'vue'
import { MerchantCategory, Rail, Transfer } from '@/types/transactions'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import type { Result } from '@/types'
import {
  type GoCryptoPaymentApiError,
  type GoCryptoPaymentDetails,
  type GoCryptoRequestIdentifier,
  type GoCryptoUserFriendlyStatus,
  fetchGoCryptoPaymentDetails,
  goCryptoStatusToUserFriendlyStatus,
  monitorGoCryptoRequest,
} from '@/composables/useGoCrypto'
import { getServerTime } from '@/composables/useTime'
import { useDevice } from '@/composables/useDevice'
import { i18n } from '@/i18n/i18n-setup'

export async function fetchGoCryptoPaymentRequestData(requestIdentifier: GoCryptoRequestIdentifier)
: Promise<Result<PaymentRequestData, string>> { // eslint-disable-line style/type-annotation-spacing, style/indent
  const goCryptoApiOptions = await getGoCryptoApiOptions()
  const paymentDetails = await fetchGoCryptoPaymentDetails(requestIdentifier, goCryptoApiOptions)
  const userFriendlyStatus = goCryptoStatusToUserFriendlyStatus(paymentDetails)
  return goCryptoPaymentDetailsToPaymentRequestData(paymentDetails, userFriendlyStatus)
}

export function useGoCryptoMonitoring(paymentRequestToMonitor: MaybeRef<Pick<PaymentRequestData, 'rail' | 'paymentRef'>>) {
  const error = ref<string>()
  const paymentRequestData = ref<PaymentRequestData>()
  const remainingTimeExpiryEarly = ref<number>()
  const remainingTimeExpiryFinal = ref<number>()
  let currentStopMonitoringHandler: (() => void) | undefined

  const unwatch = watch(
    () => [toValue(paymentRequestToMonitor).rail, toValue(paymentRequestToMonitor).paymentRef],
    async ([rail, paymentId]) => {
      currentStopMonitoringHandler?.()

      if (rail !== Rail.GoCrypto || !paymentId) {
        error.value = undefined
        paymentRequestData.value = undefined
        remainingTimeExpiryEarly.value = undefined
        remainingTimeExpiryFinal.value = undefined
        currentStopMonitoringHandler = undefined
        return
      }

      currentStopMonitoringHandler = monitorGoCryptoRequest(paymentId, {
        ...await getGoCryptoApiOptions(),
        onUpdate: (paymentDetails, userFriendlyStatus) => {
          ({ error: error.value, data: paymentRequestData.value } = goCryptoPaymentDetailsToPaymentRequestData(
            paymentDetails,
            userFriendlyStatus,
          ))
        },
        onTimerTick: (remainingTimeEarly, remainingTimeFinal) => {
          remainingTimeExpiryEarly.value = remainingTimeEarly
          remainingTimeExpiryFinal.value = remainingTimeFinal
        },
      })
    },
    { immediate: true },
  )

  const stopMonitoring = () => {
    currentStopMonitoringHandler?.()
    unwatch()
  }

  if (getCurrentScope())
    onScopeDispose(stopMonitoring)

  return {
    error,
    paymentRequestData,
    remainingTimeExpiryEarly,
    remainingTimeExpiryFinal,
    stopMonitoring,
  }
}

async function getGoCryptoApiOptions() {
  return {
    getServerTime,
    // In native app, use native fetch, to be able to send and receive arbitrary headers
    customFetch: !useDevice().isWeb
      ? await import('@capacitor/core').then(({ CapacitorHttp: { request } }) => request)
      : undefined,
  }
}

function goCryptoPaymentDetailsToPaymentRequestData(
  paymentDetails: GoCryptoPaymentDetails | GoCryptoPaymentApiError,
  userFriendlyStatus: GoCryptoUserFriendlyStatus,
): Result<PaymentRequestData, string> {
  if (userFriendlyStatus.paymentStatus === 'accepted')
    // Report already paid request as error
    return { error: userFriendlyStatus.title, data: undefined }
  else if (userFriendlyStatus.paymentStatus === 'failed')
    return { error: `${userFriendlyStatus.title}: ${userFriendlyStatus.message}`, data: undefined }
  else if ('errorCode' in paymentDetails)
    // This case should already be entirely be covered by the other cases above, and is just included here as a type guard
    return { error: i18n.t('Invalid GoCrypto link.'), data: undefined }

  // still pending GoCrypto request
  const data: PaymentRequestData = {
    recipient: paymentDetails.recipient,
    amount: paymentDetails.amount,
    fee: 0,
    merchantName: paymentDetails.storeName,
    merchantCategory: MerchantCategory.Shop, // TODO: At the moment, we don't have a way of fetching the shop category from the Crypto Map
    rail: Rail.GoCrypto,
    paymentRef: paymentDetails.id,
    transfer: Transfer.UserPaymentToMerchant,
  }
  return { error: undefined, data }
}
