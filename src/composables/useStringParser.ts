import { ValidationUtils } from '@nimiq/utils'
import { useCplApi } from './useApi'
import { nimCashlinkRegex } from '@/lib'
import { i18n } from '@/i18n/i18n-setup'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import type { Result } from '@/types'
import { Rail, ShopCategory, Transfer } from '@/types/transactions'

const CPL_URL_PARAM_ID = 'cpl_id'
const GO_CRYPTO_URL_PARAM_ID = 'gocrypto'

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
    if (!nimCashlinkRegex.test(maybeCashlink))
      return { error: i18n.t('Invalid Nimiq Cashlink'), data: undefined }

    return { data: maybeCashlink, error: undefined }
  }

  // Parses different URL formats and returns a PaymentRequestData object
  // TODO GoCrypto
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
      return { error: i18n.t('GoCrypto is not yet supported.'), data: undefined }
    return {
      error: i18n.t('Invalid QR code. Only NIM transactions from Crypto Payment Links are supported.'),
      data: undefined,
    }
  }

  function getRailFromUrl({ searchParams }: URL): Rail | undefined {
    if (searchParams.has(CPL_URL_PARAM_ID))
      return Rail.CryptoPaymentLink
    else if (searchParams.has(GO_CRYPTO_URL_PARAM_ID))
      return Rail.GoCrypto
    else
      return undefined
  }

  // CPL uses the following format: https://github.com/nimiq/nimiq-utils/blob/0b1cf9123c8f2218255eefdf48407fe14f5e8873/src/request-link-encoding/RequestLinkEncoding.ts#L217
  // And it looks like this:
  //   nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6?amount=1.83&message=cplink.com%20ref%20%23PZEd&label=Maxi%20Shoes&cpl_id=PZEdCP62
  async function parseCPLUrl({ searchParams, pathname: recipient, protocol }: URL): Promise<Result<PaymentRequestData>> {
    if (protocol !== 'nimiq:') {
      return {
        error: i18n.t('Invalid protocol. Only NIM transactions from Crypto Payment Links are supported.'),
        data: undefined,
      }
    }

    if (!searchParams.has(CPL_URL_PARAM_ID))
      return { error: i18n.t('Invalid Crypto Payment Link. Missing cpl_id.'), data: undefined }

    const rawAmount = searchParams.get('amount') || '0'
    const nimAmount = Math.round(Number.parseFloat(rawAmount))

    if (!nimAmount || !recipient)
      return { error: i18n.t('Invalid Crypto Payment Link. Missing amount or recipient.'), data: undefined }

    const lunaAmount = nimAmount * 1e5
    const fee = 0 // There is no fee in NIM (yay)
    const shopName = searchParams.get('label') || undefined
    const transfer = Transfer.UserPaymentToMerchant
    const rail = Rail.CryptoPaymentLink
    const railPeerId = searchParams.get(CPL_URL_PARAM_ID) || undefined
    const shopCategory = ShopCategory.Shop // TODO: At the moment, we don't have a way of fetching the shop category from the Crypto Map

    if (!railPeerId)
      return { error: i18n.t('Invalid Crypto Payment Link. Missing cpl_id.'), data: undefined }

    const { data: cplRes, error } = await useCplApi().getOrderById({ id: railPeerId })
    if (error || !cplRes)
      return { error: i18n.t('Invalid Crypto Payment Link. Could not fetch order.'), data: undefined }

    const { fiatCurrency, fiatAmount, itemDescription } = cplRes
    const message = searchParams.get('message') || itemDescription

    const { formatFiat } = (await import('@/composables/useCurrencyFormatter')).useCurrencyFormatter()
    const ff = (amount: number) => ({ total: amount / 1e5, formatted: formatFiat(amount / 1e5, { currency: fiatCurrency }), currency: fiatCurrency })

    const data: PaymentRequestData = { recipient, amount: lunaAmount, message, fee, shopName, shopCategory, rail, railPeerId, transfer, fiat: ff(fiatAmount), fiatFee: ff(0) }

    console.log('📷 Parsed payment request data:', data) // eslint-disable-line no-console

    return { data, error: undefined }
  }

  return {
    getNimAddress,
    getPaymentRequestData,
    getCashlink,
  }
}
