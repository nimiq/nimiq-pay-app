import { ValidationUtils } from '@nimiq/utils'
import { useDevice } from './useDevice'
import { useCplApi } from './useApi'
import { GOCRYPTO_ID_PARAM, fetchGoCryptoPaymentDetails, goCryptoStatusToUserFriendlyMessage, parseGoCryptoRequestLink } from './useGoCrypto'
import { nimiqDomainUrl } from '@/lib'
import { i18n } from '@/i18n/i18n-setup'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import type { Result } from '@/types'
import { MerchantCategory, Rail, Transfer } from '@/types/transactions'

const CPL_URL_ID_PARAM = 'cpl_id'

export enum QRDataFormat {
  NimiqAddress = 'nimiqAddress',
  PaymentRequest = 'paymentRequest',
  NimCashlink = 'nimCashlink',
}

export function useStringParser() {
  function getNimAddress(maybeNimAddress: string): Result<string> {
    if (!ValidationUtils.isValidAddress(maybeNimAddress))
      return { error: i18n.t('Invalid Nimiq address'), data: undefined }

    return { data: maybeNimAddress, error: undefined }
  }

  function getCashlink(maybeCashlink: string): Result<string> {
    // Cashlinks are Base64 URL encoded, which is the regular Base64 alphabet but uses "_" and "-" instead of "/" and
    // "+". Additionally, long character sequences are broken with a "~". The minimum Cashlink data length is 32 bytes
    // for the key + 8 byte for the amount, which is 54 Base64 chars and a "==" padding.
    const nimCashlinkRegex = new RegExp(`^https://hub\\.${nimiqDomainUrl.replaceAll('.', '\\.')}/cashlink/#[0-9A-Za-z_-]{54}[~0-9A-Za-z_-]*={0,2}$`)

    if (!nimCashlinkRegex.test(maybeCashlink))
      return { error: i18n.t('Invalid Nimiq Cashlink'), data: undefined }

    return { data: maybeCashlink, error: undefined }
  }

  // Parses different URL formats and returns a PaymentRequestData object
  // TODO Bluecode
  async function getPaymentRequestData(content: string): Promise<Result<PaymentRequestData>> {
    let url: URL
    try {
      url = new URL(content)
    }
    catch (e) {
      return { error: i18n.t('Invalid URL: {url}', { url: content }), data: undefined }
    }

    const rail = getRailFromUrl(url)
    if (rail === Rail.CryptoPaymentLink)
      return await parseCPLUrl(url)
    else if (rail === Rail.GoCrypto)
      return await parseGoCryptoUrl(url)
    return {
      error: i18n.t('Invalid link format. Only CPLinks for NIM and GoCrypto requests for NIM are supported.'),
      data: undefined,
    }
  }

  function getRailFromUrl({ href, searchParams }: URL): Rail | undefined {
    if (searchParams.has(CPL_URL_ID_PARAM))
      return Rail.CryptoPaymentLink
    else if (searchParams.has(GOCRYPTO_ID_PARAM) || parseGoCryptoRequestLink(href))
      return Rail.GoCrypto
    else
      return undefined
  }

  // CPL uses the following format: https://github.com/nimiq/nimiq-utils/blob/0b1cf9123c8f2218255eefdf48407fe14f5e8873/src/request-link-encoding/RequestLinkEncoding.ts#L217
  // And it looks like this:
  //   nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6?amount=1.83&message=cplink.com%20ref%20%23PZEd&label=Maxi%20Shoes&cpl_id=PZEdCP62
  // We will parse it as follows:
  //    { message: 'cplink.com ref #PZEd', rail: Rail.Cpl, railMerchantId: '', paymentRef: PZEdCP62, amount: 183000, recipient: 'NQ51...', merchantName: 'Maxi Shoes' }
  async function parseCPLUrl({ searchParams, pathname: recipient, protocol }: URL): Promise<Result<PaymentRequestData>> {
    if (protocol !== 'nimiq:') {
      return {
        error: i18n.t('Invalid link format. CPLinks are only supported for NIM.'),
        data: undefined,
      }
    }

    if (!searchParams.has(CPL_URL_ID_PARAM))
      return { error: i18n.t('Invalid CPLink. Missing id.'), data: undefined }

    const rawAmount = searchParams.get('amount') || '0'
    const nimAmount = Number.parseFloat(rawAmount)

    if (!nimAmount || !recipient)
      return { error: i18n.t('Invalid CPLink. Missing amount or recipient.'), data: undefined }

    const lunaAmount = Math.round(nimAmount * 1e5)
    const fee = 0 // There is no fee in NIM (yay)
    const merchantName = searchParams.get('label') || undefined
    const transfer = Transfer.UserPaymentToMerchant
    const rail = Rail.CryptoPaymentLink
    const paymentRef = searchParams.get(CPL_URL_ID_PARAM)
    const merchantCategory = MerchantCategory.Shop // TODO: At the moment, we don't have a way of fetching the shop category from the Crypto Map

    if (!paymentRef)
      return { error: i18n.t('Invalid CPLink. Missing id.'), data: undefined }

    const { data: cplRes, error } = await useCplApi().getOrderById({ id: paymentRef })
    if (error || !cplRes)
      return { error: i18n.t('Invalid CPLink. Could not fetch payment details.'), data: undefined }

    const { fiatCurrency, fiatAmount, itemDescription } = cplRes
    const fiatFeeAmount = 0 // There is no fee in NIM (yay)
    const message = searchParams.get('message') || itemDescription

    const data: PaymentRequestData = { recipient, amount: lunaAmount, message, fee, merchantName, merchantCategory, rail, paymentRef, transfer, fiatAmount, fiatCurrency, fiatFeeAmount }

    console.log('📷 Parsed payment request data:', data) // eslint-disable-line no-console

    return { data, error: undefined }
  }

  async function parseGoCryptoUrl({ href, searchParams }: URL): Promise<Result<PaymentRequestData>> {
    let goCryptoPaymentDetails
    try {
      const goCryptoRequestIdentifier = parseGoCryptoRequestLink(href)
        || (searchParams.has(GOCRYPTO_ID_PARAM) ? { paymentId: searchParams.get(GOCRYPTO_ID_PARAM)! } : null)
      goCryptoPaymentDetails = goCryptoRequestIdentifier
        ? await fetchGoCryptoPaymentDetails(goCryptoRequestIdentifier, {
          earlyExpiryOffset: 120 * 1000, // TODO remove once GoCrypto supports our instant transactions
          // In native app, use native fetch, to be able to send and receive arbitrary headers
          customFetch: !useDevice().isWeb
            ? await import('@capacitor/core').then(({ CapacitorHttp: { request } }) => request)
            : undefined,
        })
        : null
    }
    catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      // No need to translate "Error:" as the errorMessage is also in English anyway. Typically, there are not actually
      // errors expected to be thrown here.
      return { error: `${i18n.t('Invalid GoCrypto link.')} Error: ${errorMessage}`, data: undefined }
    }

    if (!goCryptoPaymentDetails)
      return { error: i18n.t('Invalid GoCrypto link.'), data: undefined }
    const goCryptoStatus = goCryptoStatusToUserFriendlyMessage(goCryptoPaymentDetails)
    if (goCryptoStatus.paymentStatus === 'accepted')
      // Report already paid request as error
      return { error: goCryptoStatus.title, data: undefined }
    else if (goCryptoStatus.paymentStatus === 'failed')
      return { error: `${goCryptoStatus.title}: ${goCryptoStatus.message}`, data: undefined }
    else if ('errorCode' in goCryptoPaymentDetails)
      // This case should already be entirely be covered by the other cases above, and is just included here as a type guard
      return { error: i18n.t('Invalid GoCrypto link.'), data: undefined }

    // still pending GoCrypto request
    const data: PaymentRequestData = {
      recipient: goCryptoPaymentDetails.recipient,
      amount: goCryptoPaymentDetails.amount,
      fee: 0,
      merchantName: goCryptoPaymentDetails.storeName,
      merchantCategory: MerchantCategory.Shop, // TODO: At the moment, we don't have a way of fetching the shop category from the Crypto Map
      rail: Rail.GoCrypto,
      paymentRef: goCryptoPaymentDetails.id,
      transfer: Transfer.UserPaymentToMerchant,
    }

    console.log('📷 Parsed payment request data:', data) // eslint-disable-line no-console

    return { data, error: undefined }
  }

  return {
    getNimAddress,
    getPaymentRequestData,
    getCashlink,
  }
}
