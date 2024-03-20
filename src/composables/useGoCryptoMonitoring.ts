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
  type GoCryptoUserFriendlyStatusOptions,
  type GoCryptoUserFriendlyStatusTitle,
  fetchGoCryptoPaymentDetails,
  goCryptoStatusToUserFriendlyStatus,
  monitorGoCryptoRequest,
} from '@/composables/useGoCrypto'
import { getServerTime } from '@/composables/useTime'
import { useDevice } from '@/composables/useDevice'
import { i18n } from '@/i18n/i18n-setup'

export async function fetchGoCryptoPaymentRequestData(requestIdentifier: GoCryptoRequestIdentifier)
: Promise<Result<PaymentRequestData, string>> { // eslint-disable-line style/type-annotation-spacing, style/indent
  const fetchOptions = await getGoCryptoApiFetchOptions()
  const paymentDetails = await fetchGoCryptoPaymentDetails(requestIdentifier, fetchOptions)
  const userFriendlyStatusOptions = getGoCryptoApiUserFriendlyStatusOptions()
  const userFriendlyStatus = goCryptoStatusToUserFriendlyStatus(paymentDetails, userFriendlyStatusOptions)
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
        ...await getGoCryptoApiFetchOptions(),
        ...getGoCryptoApiUserFriendlyStatusOptions(),
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

async function getGoCryptoApiFetchOptions() {
  return {
    getServerTime,
    // In native app, use native fetch, to be able to send and receive arbitrary headers
    customFetch: !useDevice().isWeb
      ? await import('@capacitor/core').then(({ CapacitorHttp: { request } }) => request)
      : undefined,
  }
}

function getGoCryptoApiUserFriendlyStatusOptions(): GoCryptoUserFriendlyStatusOptions<false> {
  // As Record to typecheck for missing or superfluous entries. Return entries via getters, such that translations are
  // always based on currently selected language, even if it changes during monitoring.
  /* eslint-disable no-useless-computed-key */
  const translations: Record<GoCryptoUserFriendlyStatusTitle, string> = {
    get ['Not a pending payment request']() { return i18n.t('Not a pending payment request') },
    get ['No payment request found']() { return i18n.t('No payment request found') },
    get ['GoCrypto API refused connecting']() { return i18n.t('GoCrypto refused connecting') },
    get ['Invalid GoCrypto API response']() { return i18n.t('Invalid GoCrypto response') },
    get ['Unexpected GoCrypto error']() { return i18n.t('Unexpected GoCrypto error') },
    get ['The payment request has already been paid']() { return i18n.t('Already paid') },
    get ['The payment request is being processed']() { return i18n.t('Payment is being processed') },
    get ['Your payment failed']() { return i18n.t('Payment unsuccessful') },
    get ['Your payment is invalid']() { return i18n.t('Payment invalid') },
    get ['Your payment was refunded']() { return i18n.t('Payment was refunded') },
    get ['The payment request was cancelled']() { return i18n.t('Payment cancelled') },
    get ['The payment request expired']() { return i18n.t('Payment expired') },
    get ['The payment request is about to expire']() { return i18n.t('Payment expiring soon') },
  }
  /* eslint-enable no-useless-computed-key */
  return {
    includeMessages: false,
    translations,
  }
}

function goCryptoPaymentDetailsToPaymentRequestData<IM extends boolean>(
  paymentDetails: GoCryptoPaymentDetails | GoCryptoPaymentApiError,
  userFriendlyStatus: GoCryptoUserFriendlyStatus<IM>,
): Result<PaymentRequestData, string> {
  if (userFriendlyStatus.paymentStatus === 'failed'
    || userFriendlyStatus.paymentStatus === 'accepted') // Also report already paid request as error
    return { error: userFriendlyStatus.title, data: undefined }
  else if ('errorCode' in paymentDetails)
    // This case should already be entirely be covered by the case above, and is just included here as a type guard
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
