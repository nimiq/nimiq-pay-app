import type { PaymentRequestData } from '@/lib/flows/steps.types'
import type { Result } from '@/types'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { isDev, nimiqDomainUrl } from '@/lib'
import { MerchantCategory, Rail, Transfer } from '@/types/transactions'
import { AssetId } from '@nimiq/fastspot-api-v2'
import { ValidationUtils } from '@nimiq/utils'
import { useCplApi } from './useApi'
import { parseBitcoinLightningInvoice } from './useBitcoinLightning'
import { useFastspotApiV2 } from './useFastspotV2'
import { GOCRYPTO_ID_PARAM, parseGoCryptoRequestLink } from './useGoCrypto'

const logger = useLogger('useStringParser')

const CPL_URL_ID_PARAM = 'cpl_id'
// This is for unified QR code format (Ex: bitcoin:[...]&lightning=[...])
const LN_URL_PARAM = 'lightning'

export enum QRDataFormat {
  NimiqAddress = 'nimiqAddress',
  PaymentRequest = 'paymentRequest',
  NimCashlink = 'nimCashlink',
}

export function useStringParser() {
  function getNimAddress(maybeNimAddress: string): Result<string, string> {
    if (!ValidationUtils.isValidAddress(maybeNimAddress))
      return { error: i18n.t('Invalid Nimiq address'), data: undefined }

    return { data: maybeNimAddress, error: undefined }
  }

  function getCashlink(maybeCashlink: string): Result<string, string> {
    // Cashlinks are Base64 URL encoded, which is the regular Base64 alphabet but uses "_" and "-" instead of "/" and
    // "+". Additionally, long character sequences are broken with a "~". The minimum Cashlink data length is 32 bytes
    // for the key + 8 byte for the amount, which is 54 Base64 chars and a "==" padding.
    const nimCashlinkRegex = new RegExp(`^https://hub\\.${nimiqDomainUrl.replaceAll('.', '\\.')}/cashlink/#[0-9A-Za-z_-]{54}[~0-9A-Za-z_-]*={0,2}$`)

    if (!nimCashlinkRegex.test(maybeCashlink))
      return { error: i18n.t('Invalid Nimiq Cashlink'), data: undefined }

    return { data: maybeCashlink, error: undefined }
  }

  function isPaymentRequest(content: string): boolean {
    try {
      return isLightningInvoice(content) || getRailFromUrl(new URL(content)) !== undefined
    }
    catch {
      return false
    }
  }

  function isLightningInvoice(content: string): boolean {
    return content.toLowerCase().startsWith(isDev ? 'lntb' : 'lnbc') || content.toLowerCase().startsWith('lnurl')
  }

  // Parses different URL formats and returns a PaymentRequestData object
  // TODO Bluecode
  async function getPaymentRequestData(content: string): Promise<Result<PaymentRequestData, string>> {
    // Add a protocol to Bitcoin Lightning invoices if it's missing, to pass URL parsing
    if (isLightningInvoice(content))
      content = `lightning:${content}`
    // Remove wallet.nimiq.com prefix
    if (content.startsWith(`https://wallet.nimiq${isDev ? '-testnet' : ''}.com/`)) {
      content = content.replace(`https://wallet.nimiq${isDev ? '-testnet' : ''}.com/`, '')
    }
    let url: URL
    try {
      url = new URL(content)
    }
    catch (e) {
      logger.error(`Error invalid URL: ${content}`, e)
      return { error: i18n.t('Invalid URL: {url}', { url: content }), data: undefined }
    }

    const rail = getRailFromUrl(url)
    let result: Result<PaymentRequestData, string>
    if (rail === Rail.CryptoPaymentLink) {
      result = await parseCPLUrl(url)
    }
    else if (rail === Rail.GoCrypto) {
      result = await parseGoCryptoUrl(url)
    }
    else if (rail === Rail.BitcoinLightning) {
      result = await parseBitcoinLightningUrl(url)
    }
    // If it is a payment request from the Nimiq Wallet, redirect to the withdrawal flow
    else if (rail === Rail.NimiqWallet) {
      result = parseNimiqWalletRequest(url)
    }
    else {
      result = {
        error: __ENABLE_BTC_LN__
          ? i18n.t('Invalid link format. Only CPLinks and NAKA requests for NIM and Bitcoin Lightning requests are supported.')
          : i18n.t('Invalid link format. Only CPLinks and NAKA requests for NIM are supported.'),
        data: undefined,
      }
    }

    if (result.data)
      logger.log('📷 Parsed payment request data:', result.data)

    return result
  }

  function getRailFromUrl({ href, searchParams, protocol }: URL): Rail | undefined {
    if (searchParams.has(CPL_URL_ID_PARAM))
      return Rail.CryptoPaymentLink
    else if (searchParams.has(GOCRYPTO_ID_PARAM) || parseGoCryptoRequestLink(href))
      return Rail.GoCrypto
    else if ((protocol === 'lightning:' || searchParams.has(LN_URL_PARAM)) && __ENABLE_BTC_LN__)
      return Rail.BitcoinLightning
    else if (protocol === 'nimiq:')
      return Rail.NimiqWallet
    else
      return undefined
  }

  // CPL uses the following format: https://github.com/nimiq/nimiq-utils/blob/0b1cf9123c8f2218255eefdf48407fe14f5e8873/src/request-link-encoding/RequestLinkEncoding.ts#L217
  // And it looks like this:
  //   nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6?amount=1.83&message=cplink.com%20ref%20%23PZEd&label=Maxi%20Shoes&cpl_id=PZEdCP62
  // We will parse it as follows:
  //    { message: 'cplink.com ref #PZEd', rail: Rail.Cpl, railMerchantId: '', paymentRef: PZEdCP62, amount: 183000, recipient: 'NQ51...', merchantName: 'Maxi Shoes' }
  async function parseCPLUrl({ searchParams, pathname: recipient, protocol }: URL): Promise<Result<PaymentRequestData, string>> {
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

    return { data, error: undefined }
  }

  async function parseGoCryptoUrl({ href, searchParams }: URL): Promise<Result<PaymentRequestData, string>> {
    const goCryptoRequestIdentifier = parseGoCryptoRequestLink(href)
      || (searchParams.has(GOCRYPTO_ID_PARAM) ? { paymentId: searchParams.get(GOCRYPTO_ID_PARAM)! } : null)
    if (!goCryptoRequestIdentifier)
      return { error: i18n.t('Invalid GoCrypto link.'), data: undefined }
    const { fetchGoCryptoPaymentRequestData } = await import('@/composables/useGoCryptoMonitoring')
    return fetchGoCryptoPaymentRequestData(goCryptoRequestIdentifier)
  }

  async function parseBitcoinLightningUrl(url: URL): Promise<Result<PaymentRequestData, string>> {
    let decoded: Awaited<ReturnType<typeof parseBitcoinLightningInvoice>>
    try {
      decoded = await parseBitcoinLightningInvoice(url.searchParams.get('lightning') || url.pathname)
    }
    catch (e) {
      logger.error(e)
      const errorMessage = e instanceof Error ? e.message : String(e)
      return { error: `${i18n.t('Invalid Bitcoin Lightning invoice.')} Error: ${errorMessage}`, data: undefined }
    }

    const timestampSection = decoded.sections.find(section => section.name === 'timestamp') as TimestampSection
    if (!timestampSection || !timestampSection.value)
      return { error: i18n.t('Invalid Bitcoin Lightning invoice: missing timestamp.'), data: undefined }

    // Show expiry error 20s before actual expiry
    if (timestampSection.value + decoded.expiry < Date.now() / 1e3 - 20)
      return { error: i18n.t('Bitcoin Lightning invoice expired.'), data: undefined }

    const coinNetworkSection = decoded.sections.find(section => section.name === 'coin_network') as CoinNetworkSection | undefined
    const expectedNetwork = isDev ? 'tb' : 'bc'
    if (!coinNetworkSection || coinNetworkSection.letters !== expectedNetwork)
      return { error: `${i18n.t('Wrong network in Bitcoin Lightning invoice.')} Expected "${expectedNetwork}", got "${coinNetworkSection?.letters}".`, data: undefined }

    const amountSection = decoded.sections.find(section => section.name === 'amount') as AmountSection
    if (!amountSection || !amountSection.value)
      return { error: i18n.t('Invalid Bitcoin Lightning invoice: missing amount.'), data: undefined }

    // BTC LN amounts are in millisatoshis, 3 decimals more than BTC's 8.
    const amountBtc = Number.parseInt(amountSection.value) / 1e11

    let quote
    try {
      quote = await useFastspotApiV2().then(({ createSwap }) => createSwap(
        { asset: AssetId.NIM },
        { asset: AssetId.BTC_LN, amount: amountBtc, peer: decoded.paymentRequest },
      ))
    }
    catch (e) {
      logger.error('Error creating NIM/BTC_LN swap:', { error: e, amountBtc, decoded })
      return { error: i18n.t('Cannot create NIM/BTC_LN swap'), data: undefined }
    }

    if (quote.sell.asset !== AssetId.NIM)
      return { error: i18n.t('Could not fetch NIM amount for Bitcoin Lightning swap.'), data: undefined }

    const data: PaymentRequestData = {
      recipient: decoded.paymentRequest,
      amount: quote.sell.amount,
      fee: 0,
      merchantCategory: MerchantCategory.Shop, // We don't have a way of knowing the shop category from the LN invoice
      rail: Rail.BitcoinLightning,
      paymentRef: quote.id,
      transfer: Transfer.UserPaymentToAtomicSwap,
      message: decoded.description || undefined,

      feeIncludedInAmount: true,

      invoiced: {
        amount: amountBtc,
        currency: 'BTC',
      },

      swap: {
        fees: [...quote.fees.reduce((map, fee) => {
          const entry = map.get(fee.asset) || 0
          map.set(fee.asset, entry + fee.amount)
          return map
        }, new Map<string, number>()).entries()].map(([asset, amount]) => ({ asset, amount })),
      },
    }

    return { data, error: undefined }
  }

  function parseNimiqWalletRequest({ searchParams, pathname: recipient, protocol }: URL) {
    if (protocol !== 'nimiq:')
      return { error: i18n.t('Invalid Nimiq Wallet request. Only Nimiq Wallet requests are supported.'), data: undefined }

    const rawAmount = searchParams.get('amount') || '0'
    const nimAmount = Number.parseFloat(rawAmount)

    if (!nimAmount || !recipient)
      return { error: i18n.t('Invalid Nimiq Wallet request. Missing amount or recipient.'), data: undefined }

    const data: PaymentRequestData = {
      recipient,
      amount: Math.round(nimAmount * 1e5),
      fee: 0,
      merchantCategory: MerchantCategory.Shop, // We don't have a way of knowing the shop category from the Nimiq Wallet request
      rail: Rail.NimiqWallet,
      paymentRef: '',
      transfer: Transfer.UserPaymentToMerchant,
      message: undefined,
    }

    return {
      data,
      error: undefined,
    }
  }

  return {
    getNimAddress,
    getPaymentRequestData,
    getCashlink,
    isPaymentRequest,
    isLightningInvoice,
  }
}
