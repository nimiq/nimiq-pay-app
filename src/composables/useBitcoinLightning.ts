import type { LNServiceResponse } from '@/types'

const TAG_PAY_REQUEST = 'payRequest'
// https://github.com/dolcalmi/lnurl-pay/blob/c780358f4bd51bd69690bed135c3b78653fbd109/src/utils.ts#L11C1-L12C75
const LNURL_REGEX
  = /^(?:http.*[&?]lightning=|lightning:)?(lnurl[0-9]{1,}[02-9ac-hj-np-z]+)/

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

function isURL(url: string) {
  try {
    // eslint-disable-next-line no-new
    new URL(url)
    return true
  }
  catch {
    return false
  }
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

  const { bech32 } = await import('bech32')
  // https://github.com/nbd-wtf/light-bolt11-decoder/blob/a9a0a8e2607ee2f96278c56ba16477859423ae9e/bolt11.js#L224
  const decoded = bech32.decode(parsedUrl, Number.MAX_SAFE_INTEGER)
  const array = bech32.fromWords(decoded.words)
  const data = Nimiq.BufferUtils.toAscii(new Uint8Array(array))
  if (!isURL(data))
    throw new Error('Invalid callback URL')
  return data
}

/**
 * Parses the response from a LNURL pay request. Response includes the lightning invoice (pr) for future decoding.
 * @param data
 * @returns Parsed response
 */
async function parseServiceResponse(data: { [key: string]: string | number }) {
  if (data.tag !== TAG_PAY_REQUEST)
    return null

  const callback = (`${data.callback}`).trim()
  if (!isURL(callback))
    return null

  if (Number(data.minSendable) < 1)
    throw new Error('Amount too small')

  // minSendable and maxSendable are in millisatoshi
  const min = Number(data.minSendable)
  const max = Number(data.maxSendable)
  if (!(min && max) || min > max)
    return null

  let metadata: Array<Array<string>> = []
  try {
    // https://github.com/lnurl/luds/blob/luds/06.md
    metadata = JSON.parse(data.metadata as string) as Array<Array<string>>
  }
  catch {
  }

  const description = metadata.find(([k]) => k === 'text/plain')?.[1] || ''

  const callbackURL = new URL(callback)
  const domain = callbackURL.hostname

  // We fetch the invoice with the minimum amount to avoid the user having to input it
  callbackURL.searchParams.set('amount', min.toString())
  const { pr } = await fetch(callbackURL).then(res => res.json()) as LNServiceResponse

  return {
    callback,
    pr,
    fixed: min === max,
    min,
    max,
    domain,
    metadata,
    description,
    rawData: data,
  }
}

async function parseLnurlPayRequest(url: string) {
  // First we get the callback URL from the LNURL
  const callback = await decodeCallbackUrl(url)
  // Then we fetch the data from that callback
  const res = await fetch(callback).then(res => res.json()) as { [key: string]: string | number }
  // And parse the response, fetching the lightning invoice from the callback
  return await parseServiceResponse(res)
}

export async function parseBitcoinLightningInvoice(url: string) {
  const { decode } = await import('light-bolt11-decoder')
  // Normal lightning invoice doesn't require any further processing
  if (!isLnurl(url))
    return decode(url)

  // But LNURL invoices need to be decoded first, get the invoice from the service and then decode the lightning invoice
  const invoice = await parseLnurlPayRequest(url)
  if (invoice === null)
    throw new Error('Invalid LNURL')
  if (!invoice.fixed)
    throw new Error('Variable amounts are not supported')

  return {
    ...decode(invoice.pr),
    // Description is not included in the ln invoice, so we use the one from the lnurl
    description: invoice.description,
  }
}
