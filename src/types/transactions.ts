import { i18n } from '@/i18n/i18n-setup'

export enum Transfer {
  // Normal payment from the user to the merchant
  UserPaymentToMerchant = 'user-payment-to-merchant',

  // Normal payment from the user to another user
  UserPayment = 'user-payment',

  // The users receives funds from any other user
  UserReceipt = 'user-receipt',

  // When the user receives funds, they will be automatically send to the HTLC contract
  LocalToRemote = 'local-to-remote',

  // When the user sends funds to the HTLC contract but there is already a HTLC contract with the user's address,
  // then the funds need to be recovered. And then the user can start a new HTLC contract.
  RemoteToLocal = 'remote-to-local',

  // In case something goes wrong in the logic of the app in the database, the app initializes a process to recover the funds from the HTLC contract.
  // This is an safety mechanism to ensure that the funds are not lost.
  RemoteToLocalImmediateReclaim = 'remote-to-local-immediate-reclaim',

  // If the server misbehave and doesn't sends the funds before the timeout of the HTLC, then the user can recover the funds. Usually the server will send the funds before the timeout.
  RemoteToLocalAfterTimeout = 'remote-to-local-after-timeout',

  // A special transaction to extend the validity of the HTLC contract
  ExtendRemote = 'extend-remote',
}

// The different "providers" that we support. Note that the value of each provider is the name of the query parameter that we use to identify the provider.
// e.g CryptoPaymentLink -> nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6?amount=1.83&message=cplink.com%20ref%20%23PZEd&label=Maxi%20Shoes&cpl_id=PZEdCP62
export enum Rail {
  CryptoPaymentLink = 'CPL',
  GoCrypto = 'GoCrypto',
  Bluecode = 'bluecode',
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
  senderType: Nimiq.Account.Type
  recipient: string
  recipientType: Nimiq.Account.Type
  status: Nimiq.Client.TransactionState
  timestamp: number
  amount: number
  fee: number
  hash: string
  proofSize: number
  message?: string
}

type KnownTransactionTitle = 'Top-Up' | 'Withdrawal' | 'Payment' | 'Points Payment'
// artificial string type which is actually just a string, but that assigning a regular string to is a type error
type UnknownTransactionTitle = string & { isUnknownTitle: true }
type TransactionTitle = KnownTransactionTitle | UnknownTransactionTitle

export function markAsUnknownTransactionTitle(title: string) {
  return title as UnknownTransactionTitle
}

export function translateTransactionTitle(title: TransactionTitle) {
  // Define translations as record such that ts warns us if a translation for a known title is missing
  const knownTitleTranslations: Record<KnownTransactionTitle, string> = {
    'Top-Up': i18n.t('Top-Up'),
    'Withdrawal': i18n.t('Withdrawal'),
    'Payment': i18n.t('Payment'),
    'Points Payment': i18n.t('Points Payment'),
  }
  return Object.keys(knownTitleTranslations).includes(title)
    ? knownTitleTranslations[title as KnownTransactionTitle]
    : title
}

export function translateTransactionState(state: Nimiq.Client.TransactionState) {
  // Define translations as record such that ts warns us if a translation for a transaction state is missing
  const transactionStateTranslations: Record<Nimiq.Client.TransactionState, string> = {
    new: i18n.t('New'),
    pending: i18n.t('Pending'),
    mined: i18n.t('Confirming'), // We display a just mined, but not yet confirmed transactions as confirming.
    invalidated: i18n.t('Invalid'), // For transactions that got rejected by the mempool.
    expired: i18n.t('Expired'),
    confirmed: i18n.t('Confirmed'),
  }
  return Object.keys(transactionStateTranslations).includes(state)
    ? transactionStateTranslations[state]
    : i18n.t('Unknown')
}

export type UserTransaction = BaseTransaction & {
  transfer: Transfer.UserPayment
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
}

export type MerchantTransaction = BaseTransaction & {
  transfer: Transfer.UserPaymentToMerchant
  fiatCurrency: string
  fiatAmount: number
  fiatFeeAmount: number
  isCashbackClaimed: boolean
  merchantName: string
  merchantCategory: MerchantCategory
  title: TransactionTitle
  paymentMethod: PaymentMethod
  paymentRef: string // The reference of the payment in the rail system
} & ({
  rail: Rail.CryptoPaymentLink
  railMerchantId?: undefined // The merchant id in CPL is not exposed
} | {
  rail: Rail.GoCrypto
  railMerchantId: string
} /* | {
  // TODO
  rail: Rail.Bluecode
  railMerchantId: string
} */)

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
}

export type LocalToRemoteTx = BaseTransaction & SyncTransactionBase & { transfer: Transfer.LocalToRemote }
export type RemoteToLocalTx = BaseTransaction & SyncTransactionBase & { transfer: Transfer.RemoteToLocal }
export type RemoteToLocalAfterTimeoutTx = BaseTransaction & SyncTransactionBase & { transfer: Transfer.RemoteToLocalAfterTimeout }
export type RemoteToLocalImmediateReclaimTx = BaseTransaction & SyncTransactionBase & { transfer: Transfer.RemoteToLocalImmediateReclaim }
export type ExtendRemoteTx = BaseTransaction & SyncTransactionBase & { transfer: Transfer.ExtendRemote }
export type SyncTransaction = LocalToRemoteTx | RemoteToLocalTx | RemoteToLocalAfterTimeoutTx | ExtendRemoteTx | RemoteToLocalImmediateReclaimTx

// Transactions that are sent by the user and the recipient is another user
export type ExternalTransactionSentByUser = UserTransaction | MerchantTransaction

// Transaction that the user sent to another user or internally to the HTLC contract
export type TransactionSentByUser = ExternalTransactionSentByUser | SyncTransaction

// Transactions that are received by the user and the sender is another user. Just a normal payment or transfer.
export type ExternalTransaction = ExternalTransactionSentByUser | UserReceiptTransaction

// Any transaction. Payment/Transfer or HTLC contract
export type Transaction = ExternalTransaction | SyncTransaction

export function isExternalTx(tx: Transaction): tx is ExternalTransaction {
  return [Transfer.UserPayment, Transfer.UserPaymentToMerchant, Transfer.UserReceipt].includes(tx.transfer)
}

export function isPaymentTx(tx: Transaction): tx is ExternalTransactionSentByUser {
  return [Transfer.UserPayment, Transfer.UserPaymentToMerchant].includes(tx.transfer)
}

export type PartialSendTxArgs =
  | Pick<UserTransaction | MerchantTransaction, 'recipient' | 'amount' | 'title' | 'fiatAmount' | 'fiatCurrency' | 'rail' | 'railMerchantId' | 'merchantCategory' | 'merchantName' | 'paymentRef' | 'transfer' | 'message'>
  | Pick<LocalToRemoteTx, 'transfer'>
  | Pick<ExtendRemoteTx, 'transfer'>
  | Pick<RemoteToLocalAfterTimeoutTx, 'transfer' | 'amount'> & { sender: Nimiq.Address }
  | Pick<RemoteToLocalTx, 'transfer'>
  | Pick<RemoteToLocalImmediateReclaimTx, 'transfer' | 'amount'> & { sender: Nimiq.Address }

export enum PaymentMethod {
  NIM = 'nim',
  Points = 'points',
}
