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

  // If the server misbehave and doesn't sends the funds before the timeout of the HTLC, then the user can recover the funds. Usually the server will send the funds before the timeout.
  RemoteToLocalAfterTimeout = 'remote-to-local-after-timeout',

  // A special transaction to extend the validity of the HTLC contract
  ExtendRemote = 'extend-remote',
}

// The different "providers" that we support. Note that the value of each provider is the name of the query parameter that we use to identify the provider.
// e.g CryptoPaymentLink -> nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6?amount=1.83&message=cplink.com%20ref%20%23PZEd&label=Maxi%20Shoes&cpl_id=PZEdCP62
export enum Rail {
  CryptoPaymentLink = 'cpl_id',
  GoCrypto = 'gocrypto_id',
  Bluecode = 'bluecode',
}

export interface BaseTransaction {
  raw?: string
  sender: string
  recipient: string
  status: Nimiq.Client.TransactionState
  timestamp: number
  amount: number
  fee: number
  hash: string
}

export type UserTransaction = BaseTransaction & {
  transfer: Transfer.UserPayment
  message?: string
  rail?: undefined
  railPeerId?: undefined
  locationName?: undefined
  title: string
}

export type UserReceiptTransaction = BaseTransaction & {
  transfer: Transfer.UserReceipt
  message?: string
  rail?: undefined
  railPeerId?: undefined
  locationName?: undefined
  title: string
}

export type MerchantTransaction = BaseTransaction & {
  transfer: Transfer.UserPaymentToMerchant
  locationName: string
  title: string
} & ({
  rail: Rail.CryptoPaymentLink | Rail.GoCrypto
  railPeerId: string
  message: string
} | {
  // TODO Finish Bluecode
  rail: Rail.Bluecode
  railPeerId: undefined
  message: undefined
})

export type SyncTransaction = BaseTransaction & {
  transfer: Transfer.LocalToRemote | Transfer.RemoteToLocal | Transfer.RemoteToLocalAfterTimeout | Transfer.ExtendRemote
  message?: string
  title?: undefined
  rail?: undefined
  railPeerId?: undefined
  locationName?: undefined
}

export type TransactionSentByUser = UserTransaction | MerchantTransaction | SyncTransaction
export type Transaction = UserTransaction | UserReceiptTransaction | MerchantTransaction | SyncTransaction

export type PartialSendTxArgs =
  Pick<UserTransaction | MerchantTransaction, 'transfer' | 'recipient' | 'amount' | 'message' | 'locationName' | 'rail' | 'railPeerId' | 'title'>
  | Pick<SyncTransaction, 'transfer'>
  // | Pick<SyncTransaction<Transfer.LocalToRemote>, 'transfer' | 'amount'>
