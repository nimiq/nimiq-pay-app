import type { Address, Transaction as NimiqTransaction } from '@nimiq/core'
import type { MaybeRef } from 'vue'
import type { AsyncResultApi, ResultApi } from '@/types'
import type { Rail } from '@/types/transactions'
import { useWebSocket } from '@vueuse/core'
import { readonly, ref, toValue as v, watch } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { isDev, isTestnet } from '@/lib/index'
import { isMockEnabled } from '@/lib/mock-mode'
import { promiseWithTimeout } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { toSeconds } from './useTime'

const logger = useLogger('useApi')

const basePointsUrl = new URL(isTestnet ? 'https://bonus-nim.zeromox.com/api/' : 'https://points.nimpay.app/api/')
const baseCosignerUrl = new URL(isTestnet ? 'https://pay-test-cos.nim.sh/' : 'https://cs1.nimpay.app/')
const baseCurrencyPriceUrl = new URL('https://prices.nim.sh/')
const cplApiUrl = new URL('https://firestore.googleapis.com/')
const baseNotificationsUrl = new URL('https://nimiq-pay-notifications.pages.dev/api/')

// Failure logs end up in the shareable log file, so only these body fields are logged. Phone numbers, SMS access
// codes, public keys and task answers stay out, and the Points token header is never logged.
const LOGGABLE_BODY_FIELDS = ['type', 'reference', 'destination', 'tx_hash']

async function api<T = any, E = undefined>(url: URL, { token, body: _body, delete: _delete }: { token?: string, body?: object, delete?: boolean } = {}): AsyncResultApi<T, E> {
  const method = _delete ? 'DELETE' : _body ? 'POST' : 'GET'
  const body = _body ? JSON.stringify(_body) : undefined
  const baseHeaders = { 'Content-Type': 'application/json', 'Accept-Language': useApp().language }
  const headers = token ? { ...baseHeaders, token } : baseHeaders
  const loggedRequest = {
    url: url.toString(),
    method,
    hasToken: !!token,
    body: _body && Object.fromEntries(Object.entries(_body).filter(([key]) => LOGGABLE_BODY_FIELDS.includes(key))),
  }

  let response: Response | undefined
  try {
    response = await fetch(url, { method, headers, body })

    if (!response.ok) {
      let responseBody: E | undefined
      try {
        responseBody = await response.json() as E
      }
      catch (e) {
      // If the response is not JSON or not exist, we don't do anything
        logger.error('Error parsing response', e, { ...loggedRequest, status: response.status })
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
    logger.error(`Error fetching ${url.toString()}`, { ...loggedRequest, status: response?.status }, { error })
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
  interface StatusRes { status: 'online', campaign_running: boolean, campaign_countries: string[] }

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
    senderType: 'basic' | 'vesting' | 'htlc' | 'staking'
    recipient: string
    recipientType: 'basic' | 'vesting' | 'htlc' | 'staking'
    value: number
    fee: number
    validityStartHeight: number
    flags: number | undefined
    data: string | { raw: string }
    proof: string | { raw: string }
    network: string
  }
  txSent: boolean
}

export enum RemoteSignerTransactionState {
  New = 'new',
  Included = 'included',
  Confirmed = 'confirmed',
  Failed = 'failed',
  Unknown = 'unknown',
}

export enum RemoteStatus {
  Good = 'good',
  Pending = 'pending',
  Error = 'error',
  Unknown = 'unknown',
}

const remoteSignerWsApi = (function () {
  logger.log('[remoteSignerWsApi] Initializing WebSocket connection to', baseCosignerUrl.toString())

  const pendingRequests = new Map<string, { id: string, requestObject: any, replayed: boolean, resolve: (result: ResultApi<any, any>) => void }>()
  let idCounter = 0
  const { data, send } = useWebSocket<string>(baseCosignerUrl, {
    autoReconnect: true,
    heartbeat: {
      interval: isDev ? 10e3 : 5e3,
    },
    onConnected(ws) {
      logger.log('[remoteSignerWsApi] Connected:', ws.url)
      for (const request of pendingRequests.values()) {
        request.replayed = true
        send(JSON.stringify(request.requestObject))
      }
    },
    onDisconnected(ws, event) {
      logger.warn('[remoteSignerWsApi] Disconnected:', ws.url, event)
    },
    onError(ws, event) {
      logger.error('[remoteSignerWsApi] Error:', ws.url, event)
    },
  })

  function request<T = any, E = undefined>(event: string, args: any = {}, timeoutMs = 30_000): AsyncResultApi<T, E> {
    const id = `${idCounter++}`
    const requestObject = { event, data: { ...args, id } }
    const response = new Promise<ResultApi<T, E>>((resolve) => {
      pendingRequests.set(id, { id, requestObject, replayed: false, resolve })
      send(JSON.stringify(requestObject))
    })
    // Sends retain their recovery anchor; only read requests can be discarded on timeout.
    if (event.startsWith('wallet-send-'))
      return response
    return promiseWithTimeout(response, timeoutMs)
      .catch((): ResultApi<T, E> => ({
        data: undefined,
        hasError: true,
        status: 504,
        error: { message: i18n.t('Something went wrong'), statusCode: 504, error: 'TIMEOUT' } as E,
      }))
      .finally(() => pendingRequests.delete(id))
  }

  watch(data, (newData) => {
    if (!newData)
      return
    if (newData === 'pong')
      return

    logger.log('[remoteSignerWsApi] Got:', newData)
    try {
      const responseObject: { event: 'result', data: { id: string, payload: any } } | {
        event: 'error'
        data: { id: string, statusCode?: number } & object
      } = JSON.parse(newData)
      switch (responseObject.event) {
        case 'result': {
          const pendingRequest = pendingRequests.get(responseObject.data.id)
          if (!pendingRequest) {
            logger.warn('[remoteSignerWsApi] No pending request for id:', responseObject.data.id)
            break
          }
          pendingRequest.resolve({
            data: responseObject.data.payload,
            hasError: false,
            error: undefined,
            status: 200,
          })
          pendingRequests.delete(responseObject.data.id)
        }
          break
        case 'error': {
          const pendingRequest = pendingRequests.get(responseObject.data.id)
          if (!pendingRequest) {
            logger.warn('[remoteSignerWsApi] No pending request for id:', responseObject.data.id)
            break
          }
          const requestData = pendingRequest.requestObject.data
          const payload = requestData?.payload
          logger.error('[remoteSignerWsApi] Request failed:', {
            event: pendingRequest.requestObject.event,
            id: pendingRequest.id,
            address: requestData?.address,
            payload: payload
              ? {
                  sender: payload.sender,
                  senderType: payload.senderType,
                  recipient: payload.recipient,
                  recipientType: payload.recipientType,
                  value: payload.value,
                  fee: payload.fee,
                  validityStartHeight: payload.validityStartHeight,
                  flags: payload.flags,
                  network: payload.network,
                }
              : undefined,
            response: responseObject.data,
          })
          pendingRequest.resolve({
            data: undefined,
            hasError: true,
            error: responseObject.data,
            replayed: pendingRequest.replayed,
            status: responseObject.data.statusCode ?? 500,
          })
          pendingRequests.delete(responseObject.data.id)
        }
      }
    }
    catch (e) {
      logger.error('Failed to parse message:', e)
    }
  })

  return { request }
})().request

export function useRemoteSignerApi() {
  interface GetTransactionByHashArg { hash: MaybeRef<string> }
  interface GetTransactionsByAddressArg { address: MaybeRef<string> }
  interface GetRemoteSignerArg { address: MaybeRef<Address>, includeInactive?: boolean }
  interface GetOwnerWalletsArg { owner: MaybeRef<Address> }
  interface SendTransactionArg { address: MaybeRef<string>, tx: MaybeRef<NimiqTransaction> }
  interface SendRawTransactionArg { address: MaybeRef<string>, rawTx: MaybeRef<string> }
  interface GetTransactionStateArg { hash: MaybeRef<string> }

  interface StatusRes { status: RemoteStatus, blockHeight: number, servicePublicKey: string, network: string }
  // isActive is only sent by cosigners that support includeInactive.
  interface GetRemoteSignerRes { address: string, servicePublicKey: string, serviceSignatureProofSize: number, validityStart: number, validityEnd: number, creatingTransactionHash: string, balance: number, isActive?: boolean }
  interface GetTransactionStateRes { hash: string, state: RemoteSignerTransactionState, executionResult?: boolean, timestamp: number, value: number }

  interface RemoteErrorRes {
    statusCode: number
    error: string
    message: string
  }

  async function getStatus(timeoutMs?: number): AsyncResultApi<StatusRes, RemoteErrorRes> {
    // No cosigner in mock mode: report Good here so every consumer (cosigner poll,
    // resume height check) behaves without needing its own mock guard.
    if (isMockEnabled)
      return { data: { status: RemoteStatus.Good, blockHeight: 0, servicePublicKey: '', network: '' }, status: 200, hasError: false, error: undefined }

    const { data, error, status, hasError } = await remoteSignerWsApi<StatusRes>('status', {}, timeoutMs)
    if (error || data?.status !== 'good' || hasError)
      return { data: undefined, status, hasError: true, error: error || { message: i18n.t('Something went wrong syncing your account'), statusCode: 520, error: 'Unknown Error' } }
    return { data: data!, status, hasError, error: undefined }
  }

  async function getRemoteSigner({ address, includeInactive }: GetRemoteSignerArg): AsyncResultApi<GetRemoteSignerRes, RemoteErrorRes> {
    // includeInactive also returns retired wallets instead of a 409; older cosigners ignore it.
    const { data, error, status, hasError } = await remoteSignerWsApi<GetRemoteSignerRes, RemoteErrorRes>('wallet', { address: v(address).toUserFriendlyAddress(), ...(includeInactive ? { includeInactive } : {}) })
    if (error || !data?.address || hasError)
      return { data: undefined, status, hasError: true, error: error || { message: i18n.t('Something went wrong syncing your account'), statusCode: 520, error: 'Unknown Error' } }

    return { data, error: undefined, status, hasError }
  }

  // Every wallet the cosigner created for an owner, retired ones included, without balances.
  async function getOwnerWallets({ owner }: GetOwnerWalletsArg): AsyncResultApi<Omit<GetRemoteSignerRes, 'balance'>[], RemoteErrorRes> {
    const { data, error, status, hasError } = await remoteSignerWsApi<Omit<GetRemoteSignerRes, 'balance'>[], RemoteErrorRes>('owner-wallets', { owner: v(owner).toUserFriendlyAddress() })
    if (error || !Array.isArray(data) || hasError)
      return { data: undefined, status, hasError: true, error: error || { message: 'Invalid cosigner response', statusCode: 520, error: 'Unknown Error' } }
    return { data, error: undefined, status, hasError }
  }

  return {
    getStatus,
    getTransactionByHash: ({ hash }: GetTransactionByHashArg) => remoteSignerWsApi<Transaction, RemoteErrorRes>('tx', { hash: v(hash) }),
    getTransactionsByAddress: ({ address }: GetTransactionsByAddressArg) => remoteSignerWsApi<Transaction[], RemoteErrorRes>('wallet-txs', { address: v(address) }),
    getTransactionState: ({ hash }: GetTransactionStateArg) => remoteSignerWsApi<GetTransactionStateRes, RemoteErrorRes>('tx-state', { hash: v(hash) }),
    getRemoteSigner,
    getOwnerWallets,
    sendTransaction: ({ address, tx }: SendTransactionArg) => remoteSignerWsApi<Transaction, RemoteErrorRes>('wallet-send-tx', { address: v(address), payload: Nimiq.Transaction.fromAny(v(tx)).toPlain() }),
    sendRawTransaction: ({ address, ...body }: SendRawTransactionArg) => remoteSignerWsApi<Transaction, RemoteErrorRes>('wallet-send-raw-tx', { address: v(address), payload: body }),
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

  if (isMockEnabled) {
    // Historical lookups get a slightly lower price so PriceChange renders a believable +%.
    const mockPrice = async (currency: MaybeRef<string>, timestamp?: number): Promise<ResultApi<PriceNowRes, PriceErrorRes>> => {
      const { getMockUsdPrice } = await import('@/lib/mock-data')
      const nowSeconds = Math.round(Date.now() / 1e3)
      const isPast = timestamp !== undefined && toSeconds(timestamp) < nowSeconds - 3600
      const price = getMockUsdPrice(v(currency)) * (isPast ? 0.97 : 1)
      return { data: { currency: v(currency), time: timestamp ?? nowSeconds, price, error: undefined }, hasError: false, error: undefined, status: 200 }
    }
    return {
      getPriceNow: ({ currency }: PriceNowArg) => mockPrice(currency),
      getPriceAt: ({ currency, timestamp }: PriceAtArg) => mockPrice(currency, v(timestamp)),
    }
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
    const { data, error, status, hasError } = await api<OrderByIdFirestoreRes, PointsCplFirestoreRes>(new URL(`v1/projects/checkout-service${isTestnet ? '-staging-0' : ''}/databases/(default)/documents/orders/${v(id)}`, cplApiUrl))
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
