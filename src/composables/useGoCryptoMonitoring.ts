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
  type GoCryptoUserFriendlyStatusMessage,
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
  const translations = getGoCryptoApiTranslations()
  const userFriendlyStatus = goCryptoStatusToUserFriendlyStatus(paymentDetails, { translations })
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
        translations: getGoCryptoApiTranslations(),
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

function getGoCryptoApiTranslations() {
  // As Record to typecheck for missing or superfluous entries.
  const translations: Record<GoCryptoUserFriendlyStatusTitle | GoCryptoUserFriendlyStatusMessage, string> = {
    // Titles
    'Not a pending payment request':
      i18n.t('Not a pending payment request'),
    'No payment request found':
      i18n.t('No payment request found'),
    'GoCrypto API refused connecting':
      i18n.t('GoCrypto API refused connecting'),
    'Invalid GoCrypto API response':
      i18n.t('Invalid GoCrypto API response'),
    'Unexpected GoCrypto error':
      i18n.t('Unexpected GoCrypto error'),
    'The payment request has already been paid':
      i18n.t('The payment request has already been paid'),
    'The payment request is being processed':
      i18n.t('The payment request is being processed'),
    'Your payment failed':
      i18n.t('Your payment failed'),
    'Your payment is invalid':
      i18n.t('Your payment is invalid'),
    'Your payment was refunded':
      i18n.t('Your payment was refunded'),
    'The payment request was cancelled':
      i18n.t('The payment request was cancelled'),
    'The payment request expired':
      i18n.t('The payment request expired'),
    'The payment request is about to expire':
      i18n.t('The payment request is about to expire'),
    // Messages
    'The payment request might have been paid, expired, or cancelled.':
      i18n.t('The payment request might have been paid, expired, or cancelled.'),
    'Received an invalid response from GoCrypto: {errorMessage}.':
      // Preserve placeholders as interpolation is handled by GoCrypto api.
      i18n.t('Received an invalid response from GoCrypto: {errorMessage}.', { errorMessage: '{errorMessage}' }),
    'Error {errorCodeAndMessage}.':
      // Preserve placeholders as interpolation is handled by GoCrypto api.
      i18n.t('Error {errorCodeAndMessage}.', { errorCodeAndMessage: '{errorCodeAndMessage}' }),
    'Please ask the merchant to check the status of your payment.':
      i18n.t('Please ask the merchant to check the status of your payment.'),
    'Please ask the merchant to create a new payment request.':
      i18n.t('Please ask the merchant to create a new payment request.'),
    'If you already made a payment, wait for it to be confirmed instead.':
      i18n.t('If you already made a payment, wait for it to be confirmed instead.'),
    'If you already made a payment which was not accepted, please contact GoCrypto for a refund.':
      i18n.t('If you already made a payment which was not accepted, please contact GoCrypto for a refund.'),
    'If you\'re in the same WiFi as the merchant, try both switching to mobile data. Otherwise, try again in one hour.':
      i18n.t('If you\'re in the same WiFi as the merchant, try both switching to mobile data. Otherwise, try again in one hour.'),
  }
  return translations
}

function goCryptoPaymentDetailsToPaymentRequestData(
  paymentDetails: GoCryptoPaymentDetails | GoCryptoPaymentApiError,
  userFriendlyStatus: GoCryptoUserFriendlyStatus<true>,
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
