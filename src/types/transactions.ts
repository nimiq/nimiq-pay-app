import type * as Nimiq from '@nimiq/core'
import type { PlainTransactionDetails } from '@nimiq/core'
import type { Asset, Chain } from '@/lib/assets'
import { i18n } from '@/i18n/i18n-setup'

export enum Transfer {
  UserPaymentToMerchant = 'user-payment-to-merchant',

  UserPaymentToAtomicSwap = 'user-payment-to-atomic-swap',

  UserPayment = 'user-payment',

  UserReceipt = 'user-receipt',

  LocalToRemote = 'local-to-remote',

  RemoteToLocal = 'remote-to-local',

  RemoteToLocalImmediateReclaim = 'remote-to-local-immediate-reclaim',

  RemoteToLocalAfterTimeout = 'remote-to-local-after-timeout',

  ExtendRemote = 'extend-remote',

  Staking = 'staking',
}

export enum Rail {
  CryptoPaymentLink = 'CPL',
  GoCrypto = 'GoCrypto',
  Bluecode = 'bluecode',
  BitcoinLightning = 'bitcoin-lightning',
  NimiqWallet = 'nimiq-wallet',
  MiniApp = 'mini-app',
  Unknown = 'unknown',
}

export const PointsHashPrefix = 'PointsPayment#'

export enum MerchantCategory {
  CarsBikes = 'cars_bikes',
  Cash = 'cash',
  ComputerElectronics = 'computer_electronics',
  Entertainment = 'entertainment',
  FoodDrinks = 'food_drinks',
  HealthBeauty = 'health_beauty',
  HotelLodging = 'hotel_lodging',
  LeisureActivities = 'leisure_activities',
  RestaurantBar = 'restaurant_bar',
  Shop = 'shop',
  SportsFitness = 'sports_fitness',
  Miscellaneous = 'miscellaneous',
}

export interface BaseTransaction {
  raw?: string
  sender: string
  senderType?: Nimiq.AccountType
  recipient: string
  recipientType?: Nimiq.AccountType
  status: AppTransactionState
  executionResult?: boolean
  timestamp: number | undefined
  amount: number
  fee: number
  hash: string
  proofSize: number
  validityStartHeight?: number | null
  asset?: Asset
  chain?: Chain
  message?: string
  invoiced?: {
    amount: number
    currency: string
  }
  meta?: Record<string, any>
}

type KnownTransactionTitle
  = | 'Top-Up'
    | 'Cashlink Claiming'
    | 'Withdrawal'
    | 'Payment'
    | 'Points Payment'
    | 'Create Staker'
    | 'Add Stake'
    | 'Set Active Stake'
    | 'Update Staker'
    | 'Retire Stake'
    | 'Remove Stake'
    | 'Delete Validator'
    | 'Staking Contract'
type UnknownTransactionTitle = string & { isUnknownTitle: true }
export type TransactionTitle = KnownTransactionTitle | UnknownTransactionTitle

export function markAsUnknownTransactionTitle(title: string) {
  return title as UnknownTransactionTitle
}

export function translateTransactionTitle(title: TransactionTitle) {
  const knownTitleTranslations: Record<KnownTransactionTitle, string> = {
    'Top-Up': i18n.t('Top-Up'),
    'Cashlink Claiming': i18n.t('Cashlink Claiming'),
    'Withdrawal': i18n.t('Withdrawal'),
    'Payment': i18n.t('Payment'),
    'Points Payment': i18n.t('Points Payment'),
    'Create Staker': i18n.t('Create Staker'),
    'Add Stake': i18n.t('Add Stake'),
    'Set Active Stake': i18n.t('Set Active Stake'),
    'Update Staker': i18n.t('Update Staker'),
    'Retire Stake': i18n.t('Retire Stake'),
    'Remove Stake': i18n.t('Remove Stake'),
    'Delete Validator': i18n.t('Delete Validator'),
    'Staking Contract': i18n.t('Staking Contract'),
  }
  return Object.keys(knownTitleTranslations).includes(title)
    ? knownTitleTranslations[title as KnownTransactionTitle]
    : title
}

export function translateTransactionState(state: AppTransactionState) {
  const transactionStateTranslations: Record<AppTransactionState, string> = {
    new: i18n.t('New'),
    pending: i18n.t('Pending'),
    mined: i18n.t('Confirming'),
    included: i18n.t('Confirming'),
    invalidated: i18n.t('Invalid'),
    failed: i18n.t('Invalid'),
    expired: i18n.t('Expired'),
    confirmed: i18n.t('Confirmed'),
  }
  return Object.keys(transactionStateTranslations).includes(state)
    ? transactionStateTranslations[state]
    : i18n.t('Unknown')
}

export function isPendingAtomicSwapTransaction(tx: Pick<BaseTransaction, 'status' | 'meta'> & { transfer: Transfer }) {
  return tx.transfer === Transfer.UserPaymentToAtomicSwap
    && tx.status !== 'expired'
    && tx.status !== 'failed'
    && tx.status !== 'invalidated'
    && !tx.meta?.secret
    && !tx.meta?.refunded
    && !tx.meta?.imported
}

export type UserTransaction = BaseTransaction & {
  transfer: Transfer.UserPayment
  rail?: Rail.MiniApp | Rail.Unknown
  railMerchantId?: undefined
  paymentRef?: undefined
  merchantName?: undefined
  merchantCategory?: undefined
  title: TransactionTitle
  paymentMethod?: undefined
  fiatCurrency?: undefined
  fiatAmount?: undefined
  fiatFeeAmount?: undefined
  isCashbackClaimed?: undefined
  recipientData?: undefined
  senderData?: undefined
}

export type UserReceiptTransaction = BaseTransaction & {
  transfer: Transfer.UserReceipt
  rail?: undefined
  railMerchantId?: undefined
  paymentRef?: undefined
  merchantName?: undefined
  merchantCategory?: undefined
  title: TransactionTitle
  paymentMethod?: undefined
  fiatCurrency?: undefined
  fiatAmount?: undefined
  fiatFeeAmount?: undefined
  isCashbackClaimed?: undefined
  recipientData?: undefined
  senderData?: undefined
}

export type MerchantTransaction = BaseTransaction & {
  transfer: Transfer.UserPaymentToMerchant | Transfer.UserPaymentToAtomicSwap
  fiatCurrency: string
  fiatAmount: number
  fiatFeeAmount: number
  isCashbackClaimed: boolean
  merchantName: string
  merchantCategory: MerchantCategory
  title: TransactionTitle
  paymentMethod: PaymentMethod
  paymentRef: string
  recipientData?: undefined
  senderData?: undefined
} & ({
  rail: Rail.CryptoPaymentLink
  railMerchantId?: undefined // The merchant id in CPL is not exposed
} | {
  rail: Rail.GoCrypto
  railMerchantId: string
} | {
  rail: Rail.BitcoinLightning
  railMerchantId: string
} | {
  rail: Rail.NimiqWallet
  railMerchantId?: undefined
} | {
  rail: Rail.Unknown
  railMerchantId?: undefined
})

export type StakingData = {
  type: 'create-staker'
  delegation: string
} | {
  type: 'add-stake'
} | {
  type: 'update-staker'
  newDelegation: string
  reactivateAllStake: boolean
} | {
  type: 'set-active-stake'
  newActiveBalance: number
} | {
  type: 'retire-stake'
  retireStake: number
} | {
  type: 'remove-stake'
}

/**
 * Remove-stake and staking signals move no funds out of the wallet, and the staking contract only checks the staker's
 * proof, so the local wallet (the staker) sends them. Staking can drain the HTLC, which the chain then prunes, so an
 * HTLC sender would be invalid. Signals with a fee the local balance cannot cover stay on the HTLC.
 */
export function isSentByLocalWallet(stakingData: StakingData, fee: number, localBalance: number) {
  if (stakingData.type === 'remove-stake')
    return true
  const isSignal = stakingData.type === 'set-active-stake' || stakingData.type === 'retire-stake' || stakingData.type === 'update-staker'
  return isSignal && fee <= localBalance
}

export type StakingTransaction = BaseTransaction & {
  transfer: Transfer.Staking
  title: TransactionTitle
  recipientData?: string
  senderData?: string
  rail?: Rail.MiniApp
  railMerchantId?: string
  merchantName?: string

  merchantCategory?: undefined
  paymentMethod?: undefined
  paymentRef?: undefined
  fiatAmount?: undefined
  fiatFeeAmount?: undefined
  fiatCurrency?: undefined
  isCashbackClaimed?: undefined
}

interface SyncTransactionBase {
  title?: undefined
  rail?: undefined
  railMerchantId?: undefined
  paymentRef?: undefined
  merchantName?: undefined
  merchantCategory?: undefined
  paymentMethod?: undefined
  fiatCurrency?: undefined
  fiatAmount?: undefined
  fiatFeeAmount?: undefined
  isCashbackClaimed?: undefined
  recipientData?: undefined
  senderData?: undefined
}

export type LocalToRemoteTx = BaseTransaction & SyncTransactionBase & { transfer: Transfer.LocalToRemote }
export type RemoteToLocalTx = BaseTransaction & SyncTransactionBase & { transfer: Transfer.RemoteToLocal }
export type RemoteToLocalAfterTimeoutTx = BaseTransaction & SyncTransactionBase & { transfer: Transfer.RemoteToLocalAfterTimeout }
export type RemoteToLocalImmediateReclaimTx = BaseTransaction & SyncTransactionBase & { transfer: Transfer.RemoteToLocalImmediateReclaim }
export type ExtendRemoteTx = BaseTransaction & SyncTransactionBase & { transfer: Transfer.ExtendRemote }
export type SyncTransaction = LocalToRemoteTx | RemoteToLocalTx | RemoteToLocalAfterTimeoutTx | ExtendRemoteTx | RemoteToLocalImmediateReclaimTx

export type ExternalTransactionSentByUser = UserTransaction | MerchantTransaction | StakingTransaction

export type TransactionSentByUser = ExternalTransactionSentByUser | SyncTransaction

export type RecoverablePlainTransactionDetails
  = Omit<PlainTransactionDetails, 'validityStartHeight'> & {
    validityStartHeight?: number | null
  }

export type TransactionSendResult
  = | {
    outcome: 'submitted'
    tx: TransactionSentByUser
    serialized: string
    swapSettlement?: Promise<boolean>
  }
  | {
    outcome: 'rejected'
    reason?: 'busy'
    error: string
  }
  | {
    outcome: 'unknown'
    stagedTx: TransactionSentByUser
    stagedHash: string
    error: string
    serialized?: string
  }

export type ExternalTransaction = ExternalTransactionSentByUser | UserReceiptTransaction

export type Transaction = ExternalTransaction | SyncTransaction

export function isExternalTx(tx: Transaction): tx is ExternalTransaction {
  return [Transfer.UserPayment, Transfer.UserPaymentToMerchant, Transfer.UserPaymentToAtomicSwap, Transfer.UserReceipt, Transfer.Staking].includes(tx.transfer)
}

const PAYMENT_TRANSFERS = [Transfer.UserPayment, Transfer.UserPaymentToMerchant, Transfer.UserPaymentToAtomicSwap] as const

export function isPaymentTransferType(transfer: Transfer): transfer is Transfer.UserPayment | Transfer.UserPaymentToMerchant | Transfer.UserPaymentToAtomicSwap {
  return (PAYMENT_TRANSFERS as readonly Transfer[]).includes(transfer)
}

export function isPaymentTx(tx: Transaction): tx is ExternalTransactionSentByUser {
  return isPaymentTransferType(tx.transfer)
}

export type PartialUserTxArgs = Pick<UserTransaction | MerchantTransaction, 'recipient' | 'amount' | 'fee' | 'title' | 'fiatAmount' | 'fiatCurrency' | 'rail' | 'railMerchantId' | 'merchantCategory' | 'merchantName' | 'paymentRef' | 'transfer' | 'message' | 'invoiced' | 'meta'>
export type PartialStakingTxArgs = Pick<StakingTransaction, 'amount' | 'fee' | 'title' | 'meta' | 'rail' | 'railMerchantId' | 'merchantName' | 'transfer'> & { stakingData: StakingData }

export type PartialSendTxArgs
  = | PartialUserTxArgs
    | Pick<LocalToRemoteTx, 'transfer'>
    | Pick<ExtendRemoteTx, 'transfer'>
    | Pick<RemoteToLocalAfterTimeoutTx, 'transfer' | 'amount'> & { sender: Nimiq.Address }
    | Pick<RemoteToLocalTx, 'transfer'>
    | Pick<RemoteToLocalImmediateReclaimTx, 'transfer' | 'amount'> & {
      sender: Nimiq.Address
      proofSize: number
    }
    | PartialStakingTxArgs

export enum PaymentMethod {
  NIM = 'nim',
  USDT = 'usdt',
  Points = 'points',
}

export type AppTransactionState = Nimiq.TransactionState | 'mined' | 'failed'
