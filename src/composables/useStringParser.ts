import type { Quote } from '@nimiq/fastspot-api-v2'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import type { Result } from '@/types'
import { AssetId } from '@nimiq/fastspot-api-v2'
import { Currency, EthereumChain, parseRequestLink, ValidationUtils } from '@nimiq/utils'
import { getAddress } from 'ethers'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { isTestnet, nimiqDomainUrl } from '@/lib'
import { Asset, Chain } from '@/lib/assets'
import { addressesEqual, isValidEthAddress } from '@/lib/ethereum'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { SQLQuery } from '@/lib/sql-queries'
import { startSwapStep } from '@/lib/swap-telemetry'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { MerchantCategory, Rail, Transfer } from '@/types/transactions'
import { useCplApi } from './useApi'
import { parseBitcoinLightningInvoice } from './useBitcoinLightning'
import { useFastspotApiV2 } from './useFastspotV2'
import { GOCRYPTO_ID_PARAM, parseGoCryptoRequestLink } from './useGoCrypto'

const logger = useLogger('useStringParser')
const { query, run } = useConn()

const CPL_URL_ID_PARAM = 'cpl_id'
// This is for unified QR code format (Ex: bitcoin:[...]&lightning=[...])
const LN_URL_PARAM = 'lightning'

export enum QRDataFormat {
  NimiqAddress = 'nimiqAddress',
  AssetAddress = 'assetAddress',
  PaymentRequest = 'paymentRequest',
  NimCashlink = 'nimCashlink',
}

export function useStringParser() {
  function getPolygonAddress(maybePolygonAddress: string): Result<string, string> {
    if (!isValidEthAddress(maybePolygonAddress))
      return { error: i18n.t('Invalid USDT address'), data: undefined }

    return { data: getAddress(maybePolygonAddress), error: undefined }
  }

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
      if (isValidEthAddress(content))
        return true
      const normalizedContent = content.startsWith(`https://wallet.nimiq${isTestnet ? '-testnet' : ''}.com/`)
        ? content.replace(`https://wallet.nimiq${isTestnet ? '-testnet' : ''}.com/`, '')
        : content
      if (isLightningInvoice(normalizedContent))
        return true

      if (parsePolygonRequestLink(normalizedContent).data)
        return true

      const url = new URL(normalizedContent)
      return getRailFromUrl(url) !== undefined
    }
    catch {
      return false
    }
  }

  function isLightningInvoice(content: string): boolean {
    return content.toLowerCase().startsWith(isTestnet ? 'lntb' : 'lnbc') || content.toLowerCase().startsWith('lnurl')
  }

  // Parses different URL formats and returns a PaymentRequestData object
  // TODO Bluecode
  async function getPaymentRequestData(content: string, lightningSellAsset?: Asset): Promise<Result<PaymentRequestData, string>> {
    if (isValidEthAddress(content))
      return parsePolygonAddress(content)

    // Add a protocol to Bitcoin Lightning invoices if it's missing, to pass URL parsing
    if (isLightningInvoice(content))
      content = `lightning:${content}`
    // Remove wallet.nimiq.com prefix
    if (content.startsWith(`https://wallet.nimiq${isTestnet ? '-testnet' : ''}.com/`)) {
      content = content.replace(`https://wallet.nimiq${isTestnet ? '-testnet' : ''}.com/`, '')
    }
    let url: URL
    try {
      url = new URL(content)
    }
    catch (e) {
      // Scanned or pasted content can be anything (even a seed phrase), and some engines echo it in the URL
      // error's message. Logs reach PostHog and support reports, so record neither.
      logger.error('Error invalid URL', { length: content.length, errorName: e instanceof Error ? e.name : typeof e })
      // The returned error reaches logs, toasts and Mini Apps, so it must not echo the input.
      return { error: i18n.t('Invalid URL'), data: undefined }
    }

    if (url.protocol === 'ethereum:' || url.protocol === 'polygon:')
      return parsePolygonRequestLink(content)

    const rail = getRailFromUrl(url)
    let result: Result<PaymentRequestData, string>
    if (rail === Rail.CryptoPaymentLink) {
      result = await parseCPLUrl(url)
    }
    else if (rail === Rail.GoCrypto) {
      result = await parseGoCryptoUrl(url)
    }
    else if (rail === Rail.BitcoinLightning) {
      result = await parseBitcoinLightningUrl(url, lightningSellAsset)
    }
    // If it is a payment request from the Nimiq Wallet, redirect to the withdrawal flow
    else if (rail === Rail.NimiqWallet) {
      result = parseNimiqWalletRequest(url)
    }
    else {
      result = {
        error: __ENABLE_BTC_LN__
          ? i18n.t('Invalid link format. Only CPLinks for NIM and Bitcoin Lightning requests are supported.')
          : i18n.t('Invalid link format. Only CPLinks for NIM are supported.'),
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
    const merchantCategory = MerchantCategory.Shop

    if (!paymentRef)
      return { error: i18n.t('Invalid CPLink. Missing id.'), data: undefined }

    const { data: cplRes, error } = await useCplApi().getOrderById({ id: paymentRef })
    if (error || !cplRes)
      return { error: i18n.t('Invalid CPLink. Could not fetch payment details.'), data: undefined }

    const { fiatCurrency, fiatAmount, itemDescription } = cplRes
    const fiatFeeAmount = 0 // There is no fee in NIM (yay)
    const message = searchParams.get('message') || itemDescription

    const data: PaymentRequestData = { recipient, amount: lunaAmount, message, fee, merchantName, merchantCategory, rail, paymentRef, transfer, fiatAmount, fiatCurrency, fiatFeeAmount, asset: Asset.NIM, chain: Chain.Nimiq }

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

  async function parseBitcoinLightningUrl(url: URL, sellAsset?: Asset): Promise<Result<PaymentRequestData, string>> {
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
    const invoiceExpiresAt = timestampSection.value + (decoded.sections.find(section => section.name === 'expiry')?.value ?? 3600)

    // Show expiry error 20s before actual expiry
    if (invoiceExpiresAt <= Date.now() / 1e3 + 20)
      return { error: i18n.t('Bitcoin Lightning invoice expired.'), data: undefined }

    const coinNetworkSection = decoded.sections.find(section => section.name === 'coin_network') as CoinNetworkSection | undefined
    const expectedNetwork = isTestnet ? 'tb' : 'bc'
    if (!coinNetworkSection || coinNetworkSection.letters !== expectedNetwork)
      return { error: `${i18n.t('Wrong network in Bitcoin Lightning invoice.')} Expected "${expectedNetwork}", got "${coinNetworkSection?.letters}".`, data: undefined }

    const amountSection = decoded.sections.find(section => section.name === 'amount') as AmountSection
    if (!amountSection || !amountSection.value)
      return { error: i18n.t('Invalid Bitcoin Lightning invoice: missing amount.'), data: undefined }

    // BTC LN amounts are in millisatoshis, 3 decimals more than BTC's 8.
    const amountBtc = Number.parseInt(amountSection.value) / 1e11

    const isUsdt = (sellAsset ?? useApp().activeAsset) === Asset.USDT
    const sellAssetId = isUsdt ? AssetId.USDT_MATIC : AssetId.NIM
    const swapQuoteCacheKey = `${sellAssetId}:${decoded.paymentRequest}`

    let quote: Quote
    const quoteStartedAt = Date.now()
    const existingQuote = await query<{ ln_invoice: string, swap_id: string } | undefined>(SQLQuery.GetSwapQuote, [swapQuoteCacheKey], { single: true })
    const quoteStep = startSwapStep('quote', { asset: isUsdt ? Asset.USDT : Asset.NIM, swap_id: existingQuote?.swap_id }, {
      reused: !!existingQuote,
      invoice_expires_in_s: Math.round(invoiceExpiresAt - Date.now() / 1e3),
    }, quoteStartedAt)
    if (existingQuote) {
      try {
        // TODO: I don't know what could happen if the swap was already created
        // const quoteOrSwap = await useFastspotApiV2().then(({ getSwap }) => getSwap(existingQuote.swap_id))
        // if('hash' in quoteOrSwap) {
        //   return { error: i18n.t('Swap for this invoice was already created, create a new invoice'), data: undefined }
        // } else {
        //   quote = quoteOrSwap
        // }
        quote = await useFastspotApiV2().then(({ getSwap }) => getSwap(existingQuote.swap_id))
      }
      catch (e) {
        logger.error('Error fetching existing swap:', { error: e, decoded })
        quoteStep.fail(e)
        return { error: i18n.t('Cannot fetch existing swap'), data: undefined }
      }
    }
    else {
      try {
        quote = await useFastspotApiV2().then(({ createSwap }) => createSwap(
          { asset: sellAssetId },
          { asset: AssetId.BTC_LN, amount: amountBtc, peer: decoded.paymentRequest },
        ))
        await run(SQLQuery.InsertSwapQuote, [swapQuoteCacheKey, quote.id, Math.min(invoiceExpiresAt, quote.expiry) * 1e3])
      }
      catch (e) {
        logger.error('Error creating swap:', { error: e, amountBtc, decoded, sellAssetId })
        quoteStep.fail(e)
        return { error: i18n.t('Cannot create swap'), data: undefined }
      }
    }
    quoteStep.end(true, { swap_id: quote.id, quote_expires_in_s: Math.round(quote.expiry - Date.now() / 1e3) })

    if (quote.sell.asset !== sellAssetId)
      return { error: i18n.t('Could not fetch amount for Bitcoin Lightning swap.'), data: undefined }

    // Aggregate fees by (asset, included, source):
    // - Included fees with same key: sum amounts
    // - Non-included fees with same key: take max (e.g. redemption/refund are alternatives)
    const feeMap = new Map<string, { asset: string, amount: number, included: boolean, source: 'NETWORK' | 'SERVICE', percentage?: number }>()
    for (const fee of quote.fees) {
      const key = `${fee.asset}-${fee.included}-${fee.source}`
      const existing = feeMap.get(key)
      if (existing) {
        existing.amount = fee.included
          ? existing.amount + fee.amount
          : Math.max(existing.amount, fee.amount)
      }
      else {
        feeMap.set(key, {
          asset: fee.asset,
          amount: fee.amount,
          included: fee.included,
          source: fee.source as 'NETWORK' | 'SERVICE',
          ...('percentage' in fee && fee.percentage != null ? { percentage: Number(fee.percentage) } : {}),
        })
      }
    }

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
        fees: [...feeMap.values()],
      },
      asset: isUsdt ? Asset.USDT : Asset.NIM,
      chain: isUsdt ? Chain.Polygon : Chain.Nimiq,
    }

    return { data, error: undefined }
  }

  function parseNimiqWalletRequest({ searchParams, pathname: recipient, protocol }: URL) {
    if (protocol !== 'nimiq:')
      return { error: i18n.t('Invalid Nimiq Wallet request. Only Nimiq Wallet requests are supported.'), data: undefined }

    const rawAmount = searchParams.get('amount') || '0'
    const nimAmount = Number.parseFloat(rawAmount)

    if (!recipient)
      return { error: i18n.t('Invalid Nimiq Wallet request. Missing recipient.'), data: undefined }

    const data: PaymentRequestData = {
      recipient,
      amount: Math.round(nimAmount * 1e5),
      fee: 0,
      merchantCategory: MerchantCategory.Shop, // We don't have a way of knowing the shop category from the Nimiq Wallet request
      rail: Rail.NimiqWallet,
      paymentRef: '',
      transfer: Transfer.UserPaymentToMerchant,
      message: undefined,
      asset: Asset.NIM,
      chain: Chain.Nimiq,
    }

    return {
      data,
      error: undefined,
    }
  }

  return {
    getNimAddress,
    getPolygonAddress,
    getPaymentRequestData,
    getCashlink,
    isPaymentRequest,
    isLightningInvoice,
  }
}

function buildPolygonUsdtPaymentData(recipient: string, amount = 0): PaymentRequestData {
  return { recipient, amount, fee: 0, merchantCategory: MerchantCategory.Shop, rail: Rail.Unknown, paymentRef: '', transfer: Transfer.UserPayment, asset: Asset.USDT, chain: Chain.Polygon }
}

function parsePolygonAddress(address: string): Result<PaymentRequestData, string> {
  return {
    data: buildPolygonUsdtPaymentData(getAddress(address)),
    error: undefined,
  }
}

function parsePolygonRequestLink(content: string): Result<PaymentRequestData, string> {
  const parsed = parseRequestLink(content, {
    currencies: [Currency.USDT, Currency.MATIC],
    isValidAddress: {
      [Currency.ETH]: isValidEthAddress,
      [Currency.USDT]: isValidEthAddress,
    },
    normalizeAddress: {
      [Currency.ETH]: getAddress,
      [Currency.USDT]: getAddress,
    },
  } as any) as any

  if (!parsed)
    return { error: i18n.t('Invalid USDT Wallet request. Only USDT Wallet requests are supported.'), data: undefined }

  if (parsed.chainId !== EthereumChain.POLYGON_MAINNET)
    return { error: i18n.t('Invalid USDT Wallet request. Only Polygon network requests are supported.'), data: undefined }

  // Short-form EIP-681 receive QR (e.g. ethereum:0x…@137) carries the recipient
  // directly with no token contract or amount — treat it as a plain USDT recipient.
  if (!parsed.contractAddress && parsed.amount === undefined)
    return parsePolygonAddress(parsed.recipient)

  if (parsed.currency !== Currency.USDT) {
    return { error: i18n.t('Invalid USDT Wallet request. Only USDT Wallet requests are supported.'), data: undefined }
  }

  if (!parsed.contractAddress || !addressesEqual(parsed.contractAddress, polygonUsdtConfig.tokenContract)) {
    return { error: i18n.t('Invalid USDT Wallet request. Only USDT Wallet requests are supported.'), data: undefined }
  }

  const amount = parsed.amount === undefined
    ? 0
    : Number(parsed.amount)

  if (!Number.isFinite(amount) || amount < 0)
    return { error: i18n.t('Invalid USDT Wallet request. Missing amount or recipient.'), data: undefined }

  return {
    data: buildPolygonUsdtPaymentData(getAddress(parsed.recipient), Math.trunc(amount)),
    error: undefined,
  }
}
