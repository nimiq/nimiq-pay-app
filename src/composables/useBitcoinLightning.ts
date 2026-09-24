import type { decode } from 'light-bolt11-decoder'
import type { LNServicePaymentRequest, LNServiceResponse } from '@/types'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'

const logger = useLogger('useBitcoinLightning')

const TAG_PAY_REQUEST = 'payRequest'
const DECODE_TIMEOUT_MS = 5000
type DecodedInvoice = ReturnType<typeof decode>
type WorkerResponse = { id: number, ok: true, value: string | DecodedInvoice } | { id: number, ok: false, error: string }
const pendingDecodes = new Map<number, { resolve: (value: string | DecodedInvoice) => void, reject: (error: Error) => void, timeout: ReturnType<typeof setTimeout> }>()
let decoderWorker: Worker | undefined
let nextDecodeId = 0

function failDecoderWorker(worker: Worker, error: Error) {
  if (decoderWorker !== worker)
    return
  worker.terminate()
  decoderWorker = undefined
  for (const pending of pendingDecodes.values()) {
    clearTimeout(pending.timeout)
    pending.reject(error)
  }
  pendingDecodes.clear()
}

// The BOLT11 decoder repeatedly slices input while parsing tags, so run it outside the UI thread.
function decodeOffThread(type: 'invoice', value: string): Promise<DecodedInvoice>
function decodeOffThread(type: 'lnurl', value: string): Promise<string>
function decodeOffThread(type: 'invoice' | 'lnurl', value: string): Promise<string | DecodedInvoice> {
  if (!decoderWorker) {
    const worker = new Worker(new URL('./bitcoin-lightning.worker.ts', import.meta.url), { type: 'module' })
    decoderWorker = worker
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const pending = pendingDecodes.get(data.id)
      if (!pending)
        return
      pendingDecodes.delete(data.id)
      clearTimeout(pending.timeout)
      if (data.ok)
        pending.resolve(data.value)
      else
        pending.reject(new Error(data.error))
    }
    worker.onerror = worker.onmessageerror = () => failDecoderWorker(worker, new Error('Lightning invoice decoder failed'))
  }

  return new Promise<string | DecodedInvoice>((resolve, reject) => {
    const id = ++nextDecodeId
    const worker = decoderWorker!
    const timeout = setTimeout(() => failDecoderWorker(worker, new Error('Lightning invoice decoding timed out')), DECODE_TIMEOUT_MS)
    pendingDecodes.set(id, { resolve, reject, timeout })
    try {
      worker.postMessage({ id, type, value })
    }
    catch (error) {
      pendingDecodes.delete(id)
      clearTimeout(timeout)
      reject(error)
    }
  })
}
// https://github.com/dolcalmi/lnurl-pay/blob/c780358f4bd51bd69690bed135c3b78653fbd109/src/utils.ts#L11C1-L12C75
const LNURL_REGEX
  = /^(?:http.*[&?]lightning=|lightning:)?(lnurl\d+[02-9ac-hj-np-z]+)/

function isLnurl(url: string) {
  if (!url)
    return false
  return LNURL_REGEX.test(url.toLowerCase())
}

/**
 * Returns the LNURL part of a URL or null if it's not a valid LNURL. Accepts http(s), lightning: and basic lnurl URLs.
 * @param url
 * @returns LNURL or null
 */
function parseLnUrl(url: string): string | null {
  const result = LNURL_REGEX.exec(url.toLowerCase())
  return result ? result[1] : null
}

/**
 * Decodes the callback URL from a LNURL.
 * @param url
 * @returns Callback URL
 */
async function decodeCallbackUrl(url: string) {
  const parsedUrl = parseLnUrl(url)
  if (!parsedUrl)
    throw new Error('Invalid LNURL')

  const callbackUrl = await decodeOffThread('lnurl', parsedUrl)
  if (!URL.canParse(callbackUrl))
    throw new Error(i18n.t('Invalid callback URL'))
  return callbackUrl
}

/**
 * Parses the response from a LNURL pay request. Response includes the lightning invoice (pr) for future decoding.
 * @param response
 * @returns Parsed response
 */
async function parseServiceResponse(response: Partial<LNServiceResponse>) {
  if (response.tag !== TAG_PAY_REQUEST)
    return null

  const callback = (`${response.callback}`).trim()
  if (!URL.canParse(callback))
    return null

  if (Number(response.minSendable) < 1)
    throw new Error(i18n.t('Amount too small'))

  // minSendable and maxSendable are in millisatoshi
  const min = Number(response.minSendable)
  const max = Number(response.maxSendable)
  if (!(min && max) || min > max)
    return null
  // We only support fixed amounts for now
  if (min !== max)
    throw new Error(i18n.t('Lightning request is for a variable payment amount, but variable amounts are not supported'))

  let description = ''
  try {
    // https://github.com/lnurl/luds/blob/luds/06.md
    const metadata = JSON.parse(response.metadata as string)
    if (!Array.isArray(metadata))
      throw new Error('Invalid metadata')

    const descMeta = metadata.find(
      metaPair => Array.isArray(metaPair) && metaPair.length >= 2 && metaPair[0] === 'text/plain' && typeof metaPair[1] === 'string',
    ) as ['text/plain', string] | undefined

    description = descMeta?.[1] || ''
  }
  catch {
    // Ignore failing metadata parsing, as it only means we'd have no description
  }

  const callbackUrl = new URL(callback)

  // We need to fetch the invoice with an amount parameter to get the payment request (pr). Since we only support fixed amounts, using min or max is the same.
  callbackUrl.searchParams.set('amount', min.toString())
  try {
    const res = await fetch(callbackUrl)
    if (!res.ok)
      throw new Error(`Failed to fetch payment request: ${JSON.stringify({ status: res.status, statusText: res.statusText, url: res.url })}`)
    const responseBody = await res.json()
    if (!responseBody || typeof responseBody !== 'object' || !('pr' in responseBody) || typeof responseBody.pr !== 'string')
      throw new Error(`No payment request found: ${JSON.stringify({ responseBody, url: res.url })}`)
    const { pr } = responseBody as LNServicePaymentRequest

    return {
      pr,
      description,
    }
  }
  catch (e) {
    logger.error((e as Error).message)
    throw new Error(i18n.t('Failed to fetch payment request'))
  }
}

async function parseLnurlPayRequest(url: string) {
  // First we get the callback URL from the LNURL
  const callbackUrl = await decodeCallbackUrl(url)
  let serviceResponse: unknown
  try {
    // Then we fetch the data from that callback
    const res = await fetch(callbackUrl)
    if (!res.ok)
      throw new Error(`Failed to fetch LNURL service: ${JSON.stringify({ status: res.status, statusText: res.statusText, url: res.url })}`)
    serviceResponse = await res.json()
    if (!serviceResponse || typeof serviceResponse !== 'object')
      throw new Error(`Invalid server response: ${JSON.stringify({ url: res.url })}`)
  }
  catch (error) {
    logger.error((error as Error).message)
    throw new Error(i18n.t('Failed to fetch LNURL service'))
  }
  // And parse the response, fetching the lightning invoice from the callback
  return await parseServiceResponse(serviceResponse)
}

export async function parseBitcoinLightningInvoice(url: string) {
  // BOLT11 payment requests don't require any further processing
  if (!isLnurl(url))
    return await decodeOffThread('invoice', url)

  // But LNURL need to be decoded first, get the payment requests from the service and then decode the lightning invoice
  const invoice = await parseLnurlPayRequest(url)
  if (invoice === null)
    throw new Error(i18n.t('Invalid LNURL'))

  return {
    ...await decodeOffThread('invoice', invoice.pr),
    // A description is not included in the payment request, so we use the one from the LNURL service
    description: invoice.description,
  }
}
