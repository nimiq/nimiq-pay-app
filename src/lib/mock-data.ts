// Only ever loaded via dynamic import when mock mode is enabled, so fixtures
// (and the stores wired up in loadMockData) stay out of the production bundle
// and out of spec module graphs.
import type { ExternalTransaction } from '@/types/transactions'
import { storeToRefs } from 'pinia'
import { useLogger } from '@/composables/useLogger'
import { Asset, Chain } from '@/lib/assets'
import { Crypto, Fiat } from '@/stores/app'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { usePolygonUsdt } from '@/stores/polygon-usdt'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useTransactions } from '@/stores/transactions'
import { markAsUnknownTransactionTitle, MerchantCategory, PaymentMethod, Rail, Transfer } from '@/types/transactions'

const logger = useLogger('mock-data')

export const MOCK_NIM_BALANCE = 12_500 * 1e5 // 12,500 NIM
export const MOCK_USDT_BALANCE = 482_750_000 // 482.75 USDT

// USD price per crypto unit.
const MOCK_PRICES_USD: Record<Crypto, number> = {
  [Crypto.NIM]: 0.002,
  [Crypto.BTC]: 100_000,
  [Crypto.USDT]: 1,
}

// Fiat units per USD.
const MOCK_USD_TO_FIAT: Record<Fiat, number> = {
  [Fiat.USD]: 1,
  [Fiat.EUR]: 0.92,
  [Fiat.CRC]: 505,
  [Fiat.GMD]: 71,
}

/** Crypto price expressed in the given fiat. Used by the usePrice mock short-circuit. */
export function getMockPrice(crypto: Crypto, fiat: Fiat): number {
  return MOCK_PRICES_USD[crypto] * MOCK_USD_TO_FIAT[fiat]
}

/**
 * Price of a currency vs USD, mirroring the price API contract
 * (`/prices/<crypto>/...` returns USD per coin, `/prices/<fiat>/...` returns fiat per USD).
 */
export function getMockUsdPrice(currency: string): number {
  if (currency in MOCK_PRICES_USD)
    return MOCK_PRICES_USD[currency as Crypto]
  if (currency in MOCK_USD_TO_FIAT)
    return MOCK_USD_TO_FIAT[currency as Fiat]
  return 1
}

const MINUTE = 60 * 1e3
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Addresses are only rendered (sliced/copied), never parsed, so plausible strings are enough.
const MOCK_REMOTE_HTLC_ADDRESS = 'NQ45 M6QV 6KKM 4DHC L9QC 5T2F GU8Q D303 4661'
const MOCK_TOPUP_SENDER_ADDRESS = 'NQ57 2814 76S1 EVJM 6EFL 0F0P PV0T C1L0 RJPY'
const MOCK_WITHDRAWAL_ADDRESS = 'NQ19 YG54 46TX P7PT FUTR K1KY DDM8 GD3D AGYU'
const MOCK_MERCHANT_ADDRESS = 'NQ95 D44G 8R0B FF5U HBYY S0LS GXSH 4RVC R4XN'
const MOCK_USDT_SENDER_ADDRESS = '0x8Ec22EC81E740E0f9310E7318D03cA9454d10c95'
const MOCK_USDT_MERCHANT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'
const MOCK_USDT_WITHDRAWAL_ADDRESS = '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE'

function mockHash(seed: number): string {
  return seed.toString(16).padStart(2, '0').repeat(32)
}

export function getMockTransactions(): ExternalTransaction[] {
  const now = Date.now()
  const base = {
    status: 'confirmed' as const,
    fee: 0,
    proofSize: 98,
  }

  const nimTxs: ExternalTransaction[] = [
    {
      ...base,
      transfer: Transfer.UserPaymentToMerchant,
      // Merchant payments display the store name instead of a generic "Payment"
      title: markAsUnknownTransactionTitle('Nimiq Store'),
      sender: MOCK_REMOTE_HTLC_ADDRESS,
      senderType: Nimiq.AccountType.HTLC,
      recipient: MOCK_MERCHANT_ADDRESS,
      recipientType: Nimiq.AccountType.Basic,
      timestamp: now - 25 * MINUTE,
      amount: 4_200 * 1e5,
      hash: mockHash(1),
      asset: Asset.NIM,
      chain: Chain.Nimiq,
      rail: Rail.GoCrypto,
      railMerchantId: 'mock-merchant-1',
      merchantName: 'Nimiq Store',
      merchantCategory: MerchantCategory.Shop,
      paymentMethod: PaymentMethod.NIM,
      paymentRef: 'mock-payment-ref-1',
      fiatAmount: 8.4,
      fiatCurrency: Fiat.EUR,
      fiatFeeAmount: 0,
      isCashbackClaimed: true,
    },
    {
      ...base,
      transfer: Transfer.UserReceipt,
      title: 'Top-Up',
      sender: MOCK_TOPUP_SENDER_ADDRESS,
      senderType: Nimiq.AccountType.Basic,
      recipient: MOCK_REMOTE_HTLC_ADDRESS,
      recipientType: Nimiq.AccountType.Basic,
      message: 'Thanks for lunch!',
      timestamp: now - 5 * HOUR,
      amount: 10_000 * 1e5,
      hash: mockHash(2),
      asset: Asset.NIM,
      chain: Chain.Nimiq,
    },
    {
      ...base,
      transfer: Transfer.UserPaymentToMerchant,
      title: markAsUnknownTransactionTitle('Café Krone'),
      sender: MOCK_REMOTE_HTLC_ADDRESS,
      senderType: Nimiq.AccountType.HTLC,
      recipient: MOCK_MERCHANT_ADDRESS,
      recipientType: Nimiq.AccountType.Basic,
      timestamp: now - 1 * DAY - 2 * HOUR,
      amount: 11_350 * 1e5,
      hash: mockHash(3),
      asset: Asset.NIM,
      chain: Chain.Nimiq,
      rail: Rail.CryptoPaymentLink,
      merchantName: 'Café Krone',
      merchantCategory: MerchantCategory.RestaurantBar,
      paymentMethod: PaymentMethod.NIM,
      paymentRef: 'mock-payment-ref-2',
      fiatAmount: 22.7,
      fiatCurrency: Fiat.EUR,
      fiatFeeAmount: 0,
      isCashbackClaimed: false,
    },
    {
      ...base,
      transfer: Transfer.UserPayment,
      title: 'Withdrawal',
      sender: MOCK_REMOTE_HTLC_ADDRESS,
      senderType: Nimiq.AccountType.HTLC,
      recipient: MOCK_WITHDRAWAL_ADDRESS,
      recipientType: Nimiq.AccountType.Basic,
      timestamp: now - 2 * DAY,
      amount: 2_000 * 1e5,
      hash: mockHash(4),
      asset: Asset.NIM,
      chain: Chain.Nimiq,
    },
    {
      ...base,
      transfer: Transfer.UserReceipt,
      title: 'Top-Up',
      sender: MOCK_TOPUP_SENDER_ADDRESS,
      senderType: Nimiq.AccountType.Basic,
      recipient: MOCK_REMOTE_HTLC_ADDRESS,
      recipientType: Nimiq.AccountType.Basic,
      timestamp: now - 4 * DAY,
      amount: 7_500 * 1e5,
      hash: mockHash(5),
      asset: Asset.NIM,
      chain: Chain.Nimiq,
    },
  ]

  const usdtTxs: ExternalTransaction[] = [
    {
      ...base,
      transfer: Transfer.UserPaymentToMerchant,
      title: markAsUnknownTransactionTitle('Nimiq Store'),
      sender: MOCK_USDT_SENDER_ADDRESS,
      recipient: MOCK_USDT_MERCHANT_ADDRESS,
      timestamp: now - 40 * MINUTE,
      amount: 12_900_000, // 12.90 USDT
      fee: 10_000,
      hash: mockHash(6),
      asset: Asset.USDT,
      chain: Chain.Polygon,
      rail: Rail.CryptoPaymentLink,
      merchantName: 'Nimiq Store',
      merchantCategory: MerchantCategory.Shop,
      paymentMethod: PaymentMethod.USDT,
      paymentRef: 'mock-payment-ref-3',
      fiatAmount: 12.9,
      fiatCurrency: Fiat.USD,
      fiatFeeAmount: 0.01,
      isCashbackClaimed: false,
    },
    {
      ...base,
      transfer: Transfer.UserReceipt,
      title: 'Top-Up',
      sender: MOCK_USDT_SENDER_ADDRESS,
      recipient: MOCK_USDT_MERCHANT_ADDRESS,
      timestamp: now - 8 * HOUR,
      amount: 250_000_000, // 250 USDT
      hash: mockHash(7),
      asset: Asset.USDT,
      chain: Chain.Polygon,
    },
    {
      ...base,
      transfer: Transfer.UserPayment,
      title: 'Withdrawal',
      // HTLC sender/basic recipient so TransactionItem picks the withdraw icon, like NIM withdrawals.
      senderType: Nimiq.AccountType.HTLC,
      recipientType: Nimiq.AccountType.Basic,
      sender: MOCK_USDT_SENDER_ADDRESS,
      recipient: MOCK_USDT_WITHDRAWAL_ADDRESS,
      timestamp: now - 3 * DAY,
      amount: 75_000_000, // 75 USDT
      fee: 10_000,
      hash: mockHash(8),
      asset: Asset.USDT,
      chain: Chain.Polygon,
    },
    {
      ...base,
      transfer: Transfer.UserReceipt,
      title: 'Top-Up',
      sender: MOCK_USDT_SENDER_ADDRESS,
      recipient: MOCK_USDT_MERCHANT_ADDRESS,
      timestamp: now - 6 * DAY,
      amount: 320_650_000, // 320.65 USDT
      hash: mockHash(9),
      asset: Asset.USDT,
      chain: Chain.Polygon,
    },
  ]

  return [...nimTxs, ...usdtTxs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
}

/**
 * Fills the stores with in-memory fixtures instead of syncing with the blockchain.
 * Called from syncWallets() when mock mode is enabled. Never writes to the database.
 */
export async function loadMockData() {
  // Without this, isConsensusNeeded paths (e.g. opening the Top Up address) leave a permanent
  // tx-skeleton row and an "Establishing consensus…" pill — there is no client to ever establish.
  const { consensus } = storeToRefs(useNimiqNetwork())
  consensus.value = 'established'

  const { remoteBalance, homeBalanceState, isHtlcActive } = storeToRefs(useRemoteSigner())
  remoteBalance.value = MOCK_NIM_BALANCE
  homeBalanceState.value = 'resolved-remote'
  isHtlcActive.value = true

  const { balance: usdtBalance, consensus: polygonConsensus } = storeToRefs(usePolygonUsdt())
  usdtBalance.value = MOCK_USDT_BALANCE
  polygonConsensus.value = 'established'

  const { isAppStarting, isProcessingRemote } = storeToRefs(useLocks())
  isAppStarting.value = false
  isProcessingRemote.value = false

  // Mock-aware: hydrates the fixture transactions instead of reading the DB.
  await useTransactions().refreshFromDb()

  logger.log('🎭 Mock data loaded')
}
