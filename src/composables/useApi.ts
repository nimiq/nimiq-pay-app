import type { MaybeRef } from 'vue'
import { toValue as v } from 'vue'
import type { AsyncResult } from '@/types'
import type { RemoteSigner } from '@/lib/sql-queries'

const basePointsUrl = new URL('http://bonus-nim.zeromox.com/api')
const baseWalletUrl = new URL('https://pay-test-cos.nim.sh')
const baseCurrencyPriceUrl = new URL('https://prices.nim.sh')
const firestoreUrl = new URL('https://firestore.googleapis.com/v1/projects/checkout-service-staging-0/databases/(default)')

const baseHeaders = { 'Content-Type': 'application/json' }

async function api<T = undefined>(url: URL, { token, body: _body }: { token?: string; body?: object } = {}) {
  const method = _body ? 'POST' : 'GET'
  const body = _body ? JSON.stringify(_body) : undefined
  const headers = token ? { ...baseHeaders, token } : baseHeaders

  const response = await fetch(url, { method, headers, body }).catch(error => `Error ${method} ${url.href}: ${error}`)

  if (typeof response === 'string')
    return { error: response, data: undefined }

  if (!response.ok)
    return { error: `$Error fetching Points API ${url.href}: ${response.status} ${response.statusText}. Response ${JSON.stringify(response)}. Data ${JSON.stringify(await response.json())}`, data: undefined }

  return { data: await response.json() as T, error: undefined }
}

export function usePointsApi() {
  interface AuthorizeArg { publicKey: MaybeRef<string>; phoneNumber: MaybeRef<string> }
  interface VerifyArg { phoneNumber: MaybeRef<string>; accessCode: MaybeRef<number> }
  interface BalanceArg { token: MaybeRef<string> }
  interface PayWithPointsArg { type: MaybeRef<string>; reference?: MaybeRef<string>; destination: MaybeRef<string>; token: MaybeRef<string> }
  interface ParticipantReferralArg { token: MaybeRef<string> }
  interface ReferralIdArg { id: MaybeRef<string> }
  interface ClaimReferralArg { id: MaybeRef<string>; token: MaybeRef<string> }
  interface TaskArg { token: MaybeRef<string> }
  interface TaskIdArg { id: MaybeRef<string>; token: MaybeRef<string> }
  interface ClaimTaskArg { id: MaybeRef<string>; answer: MaybeRef<string>; token: MaybeRef<string> }

  type AuthorizeRes = string
  interface VerifyRes { token: string }
  interface BalanceRes { balance: number }
  type PayWithPointsRes = undefined
  interface ParticipantReferralRes { id: string; claims_remaining: number; reward: number }
  interface ReferralIdRes { id: string; claims_remaining: number; reward: number }
  type ClaimReferralRes = undefined
  type TaskRes = any[]
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

  return {
    authorize: ({ phoneNumber, publicKey }: AuthorizeArg) => api<AuthorizeRes>(new URL('/participant/authorize', basePointsUrl), { body: { phone_number: v(phoneNumber), public_key: v(publicKey) } }),
    verify: ({ phoneNumber, accessCode }: VerifyArg) => api<VerifyRes>(new URL('/participant/verify', basePointsUrl), { body: { phone_number: v(phoneNumber), access_code: v(accessCode) } }),
    getBalance: ({ token }: BalanceArg) => api<BalanceRes>(new URL('/participant/balance', basePointsUrl), { token: v(token) }),
    payWithPoints: ({ type, reference, destination, token }: PayWithPointsArg) => api<PayWithPointsRes>(new URL('/payment', basePointsUrl), { token: v(token), body: { type: v(type), reference: v(reference), destination: v(destination) } }),
    getReferralInfo: ({ token }: ParticipantReferralArg) => api<ParticipantReferralRes>(new URL('/participant/referral', basePointsUrl), { token: v(token) }),
    getReferralById: ({ id }: ReferralIdArg) => api<ReferralIdRes>(new URL(`/referral/${v(id)}`, basePointsUrl)),
    claimReferral: ({ id, token }: ClaimReferralArg) => api<ClaimReferralRes>(new URL(`/referral/${v(id)}/claim`, basePointsUrl), { token: v(token) }),
    getTasks: ({ token }: TaskArg) => api<TaskRes>(new URL('/task', basePointsUrl), { token: v(token) }),
    getTaskById: ({ id, token }: TaskIdArg) => api<TaskIdRes>(new URL(`/task/${v(id)}`, basePointsUrl), { token: v(token) }),
    claimTask: ({ id, token, answer }: ClaimTaskArg) => api<ClaimTaskRes>(new URL(`/task/${v(id)}/claim`, basePointsUrl), { token: v(token), body: { proof: { answer: v(answer) } } }),
  }
}

export interface Transaction {
  hash: string
  blockHash: string
  details: {
    format: string
    sender: string
    senderType: string | number
    recipient: string
    recipientType: string | number
    value: number
    fee: number
    validityStartHeight: number
    flags: number | undefined
    data: string | { raw: string }
    proof: string | { raw: string }
    network: string | number
  }
}

export function useRemoteSignerApi() {
  interface GetTransactionByHashArg { hash: MaybeRef<string> }
  interface GetTransactionsByAddressArg { address: MaybeRef<string> }
  interface GetRemoteSignerArg { address: MaybeRef<Nimiq.Address> }
  interface SendTransactionArg { address: MaybeRef<string>; tx: MaybeRef<Nimiq.Transaction | string | object> }
  interface SendRawTransactionArg { address: MaybeRef<string>; rawTx: MaybeRef<string> }

  interface StatusRes { status: 'good' | 'bad'; blockHeight: number; servicePublicKey: string; network: string }
  interface GetRemoteSignerRes { address: string; servicePublicKey: string; serviceSignatureProofSize: number; validityStart: number; validityEnd: number; balance: number }

  async function getStatus(): AsyncResult<StatusRes> {
    const { data, error } = await api<StatusRes>(new URL('/status', baseWalletUrl))
    if (error || data?.status !== 'good')
      return { data: undefined, error: error || 'Status not good' }
    return { data: data!, error: undefined }
  }

  async function getRemoteSigner({ address }: GetRemoteSignerArg): AsyncResult<RemoteSigner> {
    const { data, error } = await api<GetRemoteSignerRes>(new URL(`/wallet/${v(address).toUserFriendlyAddress()}`, baseWalletUrl))
    if (error || !data?.address)
      return { data: undefined, error: error || 'No remote signer found' }

    // The response from the server is verbose, and since these fields are used widely in the logic of the app
    // we extract them here and return a simpler object.
    const remoteSigner: RemoteSigner = {
      address: Nimiq.Address.fromString(data.address),
      balance: data.balance,
      publicKey: data.servicePublicKey,
      proofSize: data.serviceSignatureProofSize,
      start: data.validityStart,
      end: data.validityEnd,
      active: true,
    }
    return { data: remoteSigner, error: undefined }
  }

  return {
    getStatus,
    getTransactionByHash: ({ hash }: GetTransactionByHashArg) => api<Transaction>(new URL(`/tx/${v(hash)}`, baseWalletUrl)),
    getTransactionsByAddress: ({ address }: GetTransactionsByAddressArg) => api<Transaction[]>(new URL(`/txs/${v(address)}`, baseWalletUrl)),
    getRemoteSigner,
    sendTransaction: ({ address, tx }: SendTransactionArg) => api<Transaction>(new URL(`/wallet/${v(address)}/send-tx`, baseWalletUrl), { body: { tx } }),
    sendRawTransaction: ({ address, ...body }: SendRawTransactionArg) => api<Transaction>(new URL(`/wallet/${v(address)}/send-tx`, baseWalletUrl), { body }),
  }
}

export function useCurrencyPriceApi() {
  interface PriceNowArg { currency: MaybeRef<string> }
  interface PriceAtArg { currency: MaybeRef<string>; timestamp: MaybeRef<number> }

  interface PriceNowRes { price: number }
  interface PriceAtRes { price: number }

  return {
    getPriceNow: ({ currency }: PriceNowArg) => api<PriceNowRes>(new URL(`/prices/${v(currency)}/now`, baseCurrencyPriceUrl)),
    getPriceAt: ({ currency, timestamp }: PriceAtArg) => api<PriceAtRes>(new URL(`/prices/${v(currency)}/time/${v(timestamp)}`, baseCurrencyPriceUrl)),
  }
}

export function useFirestoreApi() {
  interface OrderByIdArg { id: MaybeRef<string> }
  interface OrderByIdRes { fiat_currency_code: string; fiat_price: number }

  return {
    getOrderById: ({ id }: OrderByIdArg) => api<OrderByIdRes>(new URL(`/documents/orders/${v(id)}`, firestoreUrl)),
  }
}
