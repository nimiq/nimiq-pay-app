import type { AsyncResultApi } from '@/types'
import type { Rail } from '@/types/transactions'
import type { Address, Transaction as NimiqTransaction, PlainAccountType } from '@nimiq/core'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { isDev } from '@/lib/index'
import { useApp } from '@/stores/app'
import { type MaybeRef, readonly, ref, toValue as v } from 'vue'
import { toSeconds } from './useTime'

const logger = useLogger('useApi')

const basePointsUrl = new URL(isDev ? 'https://bonus-nim.zeromox.com/api/' : 'https://points.nimpay.app/api/')
const baseCosignerUrl = new URL(isDev ? 'https://pay-test-cos.nim.sh/' : 'https://cs1.nimpay.app/')
const baseCurrencyPriceUrl = new URL('https://prices.nim.sh/')
const cplApiUrl = new URL('https://firestore.googleapis.com/')
const baseNotificationsUrl = new URL('https://nimiq-pay-notifications.pages.dev/api/')

async function api<T = any, E = undefined>(url: URL, { token, body: _body, delete: _delete }: { token?: string, body?: object, delete?: boolean } = {}): AsyncResultApi<T, E> {
  const method = _delete ? 'DELETE' : _body ? 'POST' : 'GET'
  const body = _body ? JSON.stringify(_body) : undefined
  const baseHeaders = { 'Content-Type': 'application/json', 'Accept-Language': useApp().language }
  const headers = token ? { ...baseHeaders, token } : baseHeaders

  try {
    const response = await fetch(url, { method, headers, body })

    if (!response.ok) {
      let responseBody: E | undefined
      try {
        responseBody = await response.json() as E
      }
      catch (e) {
      // If the response is not JSON or not exist, we don't do anything
        logger.error('Error parsing response', e, { response, url, method, headers, body })
      }
      return {
        error: responseBody,
        hasError: true,
        status: response.status,
        data: undefined,
      }
    }

    if (response.status === 204)
      return { data: true as T, status: response.status, hasError: false, error: undefined }

    const data = await response.json() as T

    // Handle price API responding with 200 OK when there is an error
    if (data && typeof data === 'object' && 'error' in data)
      return { data: undefined, hasError: true, error: data.error as E, status: response.status }

    return { data, status: response.status, error: undefined, hasError: false }
  }
  catch (error) {
    logger.error('Error fetching', error)
    return { data: undefined, hasError: true, error: { message: i18n.t('Something went wrong'), statusCode: 520 } as E, status: 520 }
  }
}

export function usePointsApi() {
  interface AuthorizeArg { publicKey: MaybeRef<string>, phoneNumber: MaybeRef<string> }
  interface VerifyArg { phoneNumber: MaybeRef<string>, accessCode: MaybeRef<string> }
  interface BalanceArg { token: MaybeRef<string> }
  interface PayWithPointsArg { token: MaybeRef<string>, rail: MaybeRef<Rail>, reference?: MaybeRef<string>, recipient: MaybeRef<string> }
  interface VerifyPaymentArg { token: MaybeRef<string>, rail: MaybeRef<Rail>, reference: MaybeRef<string>, recipient: MaybeRef<string> }
  interface ParticipantReferralArg { token: MaybeRef<string> }
  interface ReferralIdArg { id: MaybeRef<string> }
  interface ClaimReferralArg { id: MaybeRef<string>, token: MaybeRef<string> }
  interface TaskArg { token: MaybeRef<string> }
  interface TaskIdArg { id: MaybeRef<string>, token: MaybeRef<string> }
  interface ClaimTaskArg { id: MaybeRef<string>, answer?: MaybeRef<string>, token: MaybeRef<string> }
  interface ClaimCashbackArg { reference: MaybeRef<string>, tx_hash: MaybeRef<string>, token: MaybeRef<string> }
  interface DeleteAccountArg { token: MaybeRef<string> }

  type AuthorizeRes = string
  interface VerifyRes { token: string }
  interface VerifyPaymentRes { valid: boolean, reason: string, cashback: { percentage: number, amountInLuna: number } }
  interface BalanceRes { balance: number }
  type PayWithPointsRes = undefined
  // TODO: Get more errors from the puntos server code
  type ClaimCashbackRes = undefined | { statusCode: number, error: 'CPL_PAYMENT_REQUEST_ALREADY_PROCESSED', message: string }

  interface ParticipantReferralRes { id: string, claims_remaining: number, reward: number }
  interface ReferralIdRes { id: string, claims_remaining: number, reward: number }
  type ClaimReferralRes = undefined
  type TaskRes = Task[]
  type TaskIdRes = any
  interface ClaimTaskRes {
    created_at: string
    id: string
    participant_id: string
    task_id: string
    task_proof: string
    task_status: 'in-progress' | 'completed' | 'rejected'
    updated_at: string
  }
  interface StatusRes { status: 'online', campaign_running: boolean }

  interface PointsErrorRes {
    statusCode: number
    error: string
    message: string
    timestamp?: number
  }

  // Just remap the JSON object from the API to a TS object
  async function verifyPayment({ token, rail, reference, recipient }: VerifyPaymentArg): AsyncResultApi<VerifyPaymentRes, PointsErrorRes> {
    const { data, error, hasError, status } = await api<any>(new URL('payment/verify', basePointsUrl), { token: v(token), body: { type: v(rail), reference: v(reference), destination: v(recipient) } })
    if (hasError) {
      return {
        data: undefined,
        error: error || { message: i18n.t('Payment invalid'), statusCode: 400, error: 'INVALID_PAYMENT' },
        status,
        hasError,
      }
    }
    return { data: { ...data, cashback: { percentage: data!.cashback.percentage, amountInLuna: data!.cashback.amount_in_luna } } as VerifyPaymentRes, error: undefined, status, hasError }
  }

  return {
    authorize: ({ phoneNumber, publicKey }: AuthorizeArg) => api<AuthorizeRes, PointsErrorRes>(new URL('participant/authorize', basePointsUrl), { body: { phone_number: v(phoneNumber), public_key: v(publicKey) } }),
    verify: ({ phoneNumber, accessCode }: VerifyArg) => api<VerifyRes, PointsErrorRes>(new URL('participant/verify', basePointsUrl), { body: { phone_number: v(phoneNumber), access_code: v(accessCode) } }),
    getBalance: ({ token }: BalanceArg) => api<BalanceRes, PointsErrorRes>(new URL('participant/balance', basePointsUrl), { token: v(token) }),
    payWithPoints: ({ rail, reference, recipient, token }: PayWithPointsArg) => api<PayWithPointsRes, PointsErrorRes>(new URL('payment', basePointsUrl), { token: v(token), body: { type: v(rail), reference: v(reference), destination: v(recipient) } }),
    claimCashback: ({ reference, tx_hash, token }: ClaimCashbackArg) => api<ClaimCashbackRes, PointsErrorRes>(new URL('payment/on-chain', basePointsUrl), { token: v(token), body: { reference: v(reference), tx_hash: v(tx_hash) } }),
    verifyPayment,
    getReferralInfo: ({ token }: ParticipantReferralArg) => api<ParticipantReferralRes, PointsErrorRes>(new URL('participant/voucher', basePointsUrl), { token: v(token) }),
    getReferralById: ({ id }: ReferralIdArg) => api<ReferralIdRes, PointsErrorRes>(new URL(`voucher/${v(id)}`, basePointsUrl)),
    claimReferral: ({ id, token }: ClaimReferralArg) => api<ClaimReferralRes, PointsErrorRes>(new URL(`voucher/${v(id)}/claim`, basePointsUrl), { token: v(token) }),
    getTasks: ({ token }: TaskArg) => api<TaskRes, PointsErrorRes>(new URL('task', basePointsUrl), { token: v(token) }),
    getTaskById: ({ id, token }: TaskIdArg) => api<TaskIdRes, PointsErrorRes>(new URL(`task/${v(id)}`, basePointsUrl), { token: v(token) }),
    claimTask: ({ id, token, answer }: ClaimTaskArg) => api<ClaimTaskRes, PointsErrorRes>(new URL(`task/${v(id)}/claim`, basePointsUrl), { token: v(token), body: { proof: { answer: v(answer) } } }),
    getStatus: () => api<StatusRes, PointsErrorRes>(basePointsUrl),
    deleteAccount: ({ token }: DeleteAccountArg) => api<undefined, PointsErrorRes>(new URL('participant/delete-account', basePointsUrl), { token: v(token), delete: true }),
  }
}

export interface Transaction {
  hash: string
  blockHash: string
  details: {
    format: string
    sender: string
    senderType: PlainAccountType
    recipient: string
    recipientType: PlainAccountType
    value: number
    fee: number
    validityStartHeight: number
    flags: number | undefined
    data: string | { raw: string }
    proof: string | { raw: string }
    network: string
  }
}

export function useRemoteSignerApi() {
  interface GetTransactionByHashArg { hash: MaybeRef<string> }
  interface GetTransactionsByAddressArg { address: MaybeRef<string> }
  interface GetRemoteSignerArg { address: MaybeRef<Address> }
  interface SendTransactionArg { address: MaybeRef<string>, tx: MaybeRef<NimiqTransaction> }
  interface SendRawTransactionArg { address: MaybeRef<string>, rawTx: MaybeRef<string> }

  interface StatusRes { status: 'good' | 'bad', blockHeight: number, servicePublicKey: string, network: string }
  interface GetRemoteSignerRes { address: string, servicePublicKey: string, serviceSignatureProofSize: number, validityStart: number, validityEnd: number, creatingTransactionHash: string, balance: number }

  interface RemoteErrorRes {
    statusCode: number
    error: string
    message: string
  }

  async function getStatus(): AsyncResultApi<StatusRes, RemoteErrorRes> {
    const { data, error, status, hasError } = await api<StatusRes>(new URL('/status', baseCosignerUrl))
    if (error || data?.status !== 'good' || hasError)
      return { data: undefined, status, hasError: true, error: error || { message: i18n.t('Something went wrong syncing your account'), statusCode: 520, error: 'Unknown Error' } }
    return { data: data!, status, hasError, error: undefined }
  }

  async function getRemoteSigner({ address }: GetRemoteSignerArg): AsyncResultApi<GetRemoteSignerRes, RemoteErrorRes> {
    const { data, error, status, hasError } = await api<GetRemoteSignerRes, RemoteErrorRes>(new URL(`/wallet/${v(address).toUserFriendlyAddress().replaceAll(' ', '')}`, baseCosignerUrl))
    if (error || !data?.address || hasError)
      return { data: undefined, status, hasError: true, error: error || { message: i18n.t('Something went wrong syncing your account'), statusCode: 520, error: 'Unknown Error' } }

    return { data, error: undefined, status, hasError }
  }

  return {
    getStatus,
    getTransactionByHash: ({ hash }: GetTransactionByHashArg) => api<Transaction, RemoteErrorRes>(new URL(`/tx/${v(hash)}`, baseCosignerUrl)),
    getTransactionsByAddress: ({ address }: GetTransactionsByAddressArg) => api<Transaction[], RemoteErrorRes>(new URL(`/txs/${v(address)}`, baseCosignerUrl)),
    getRemoteSigner,
    sendTransaction: ({ address, tx }: SendTransactionArg) => api<Transaction, RemoteErrorRes>(new URL(`/wallet/${v(address)}/send-tx`, baseCosignerUrl), { body: Nimiq.Transaction.fromAny(v(tx)).toPlain() }),
    sendRawTransaction: ({ address, ...body }: SendRawTransactionArg) => api<Transaction, RemoteErrorRes>(new URL(`/wallet/${v(address)}/send-tx`, baseCosignerUrl), { body }),
  }
}

export function useCurrencyPriceApi() {
  interface PriceNowArg { currency: MaybeRef<string> }
  interface PriceAtArg { currency: MaybeRef<string>, timestamp: MaybeRef<number> }

  type PriceNowRes = { currency: string, time: number, price: number, error: undefined } | { currency: string, time: number, price: undefined, error: string }
  type PriceAtRes = { currency: string, time: number, price: number, error: undefined } | { currency: string, time: number, price: undefined, error: string }
  interface PriceErrorRes {
    statusCode: number
    error: string
    message: string
  }

  return {
    getPriceNow: ({ currency }: PriceNowArg) => api<PriceNowRes, PriceErrorRes>(new URL(`/prices/${v(currency)}/now`, baseCurrencyPriceUrl)),
    getPriceAt: ({ currency, timestamp }: PriceAtArg) => api<PriceAtRes, PriceErrorRes>(new URL(`/prices/${v(currency)}/time/${toSeconds(v(timestamp))}`, baseCurrencyPriceUrl)),
  }
}

export function useCplApi() {
  interface OrderByIdArg { id: MaybeRef<string> }
  interface OrderByIdRes {
    name: string
    createTime: string
    updateTime: string
    orderType: string
    link: string
    id: string
    acceptedCurrencies: string[]
    hasBuyerEmail: boolean
    brandName: string
    fiatCurrency: string
    fiatAmount: number
    itemDescription: string
    status: string
  }
  interface PointsCplFirestoreRes {
    error: {
      code: number
      message: string
      status: string
    }
  }

  async function getOrderById({ id }: OrderByIdArg): AsyncResultApi<OrderByIdRes, PointsCplFirestoreRes> {
    // The response from the API is verbose. We parse it here and return a simpler object.
    interface OrderByIdFirestoreRes {
      name: string
      createTime: string
      updateTime: string
      fields: {
        order_type: { stringValue: string }
        link: { stringValue: string }
        id: { stringValue: string }
        accepted_currencies: { arrayValue: { values: { stringValue: string }[] } }
        has_buyer_email: { booleanValue: boolean }
        brand_name: { stringValue: string }
        fiat_currency_code: { stringValue: string }
        fiat_price: { doubleValue: number, integerValue: undefined } | { doubleValue: undefined, integerValue: number }
        item_description: { stringValue: string }
        status: { stringValue: string }
      }
    }
    const { data, error, status, hasError } = await api<OrderByIdFirestoreRes, PointsCplFirestoreRes>(new URL(`v1/projects/checkout-service${isDev ? '-staging-0' : ''}/databases/(default)/documents/orders/${v(id)}`, cplApiUrl))
    if (error || !data || hasError)
      return { data: undefined, status, hasError, error: error || { error: { message: i18n.t('No payment details found'), code: 404, status: 'NOT_FOUND' } } }
    const parsed: OrderByIdRes = {
      name: data.name,
      createTime: data.createTime,
      updateTime: data.updateTime,
      orderType: data.fields.order_type.stringValue,
      link: data.fields.link.stringValue,
      id: data.fields.id.stringValue,
      acceptedCurrencies: data.fields.accepted_currencies.arrayValue.values.map(v => v.stringValue),
      hasBuyerEmail: data.fields.has_buyer_email.booleanValue,
      brandName: data.fields.brand_name.stringValue,
      fiatCurrency: data.fields.fiat_currency_code.stringValue,
      fiatAmount: data.fields.fiat_price.doubleValue ?? data.fields.fiat_price.integerValue,
      itemDescription: data.fields.item_description.stringValue,
      status: data.fields.status.stringValue,
    }
    return {
      data: parsed,
      error: undefined,
      status,
      hasError,
    }
  }

  return {
    getOrderById,
  }
}

export interface NotificationRes {
  id: number
  title: string
  subtitle: string
  display: 0 | 1
  action: string
  actionExtra: string
  createdAt: string
}

export function useNotificationsApi() {
  return {
    getRemoteNotifications: () => api<NotificationRes[]>(new URL('notifications/all', baseNotificationsUrl)),
  }
}

export enum FetchStatus {
  Idle = 'idle',
  Loading = 'loading',
  Error = 'error',
  Success = 'success',
}

export interface UseFetchOptions {
  immediate?: boolean
}
export function useFetch<T, E>(fn: () => AsyncResultApi<T, E>, { immediate = true }: UseFetchOptions = {}) {
  const state = ref<FetchStatus>(FetchStatus.Idle)
  const data = ref<T>()
  const error = ref<E>()

  async function fetch() {
    state.value = FetchStatus.Loading
    const { data: _data, error: _error } = await fn()
    data.value = _data
    error.value = _error
    state.value = _error ? FetchStatus.Error : FetchStatus.Success
  }

  if (immediate)
    fetch()

  return { state: readonly(state), error: readonly(error), data: readonly(data), fetch }
}
