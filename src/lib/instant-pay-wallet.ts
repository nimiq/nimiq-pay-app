import type { InjectionKey, Ref } from 'vue'
import { computed, ref } from 'vue'
import type { StorageManager } from './storage-manager'
import { TransactionStatus, TransactionType, WalletStatus, WalletType } from './storage-manager'
import type { InstantPayClient, InstantPayStatus, InstantPayWalletState } from '@/lib/instant-pay-client'
import type { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import type { NimiqWallet } from '@/lib/nimiq-wallet'

const MAX_BLOCK_HEIGHT_MISMATCH = 5
const MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND = 120

export interface PendingPayment {
  address: Nimiq.Address
  amount: number
  message?: string | null
  details?: string
  label?: string | null
  rail?: string
  railId?: string
  railPeerId?: string
  fee?: number
  fiatAmount?: number
  fiatUnit?: string
}

export class InstantPayWallet {
  public readonly ready: Ref<boolean> = ref(false)
  public readonly address: Ref<Nimiq.Address | null> = ref(null)
  public readonly balanceRaw: Ref<number> = ref(0)
  public readonly balance: Ref<number> = computed(() => this.balanceRaw.value / 100000)
  public readonly validityStart: Ref<number> = ref(0)
  public readonly validityEnd: Ref<number> = ref(0)
  public readonly timeout: Ref<number> = ref(Number.MAX_VALUE)
  public readonly valid: Ref<boolean> = computed(() => this.isValid(this.nimiqNetworkClient.head?.value?.height, this.validityStart.value, this.validityEnd.value))
  public readonly timeouted: Ref<boolean> = computed(() => this.timeout.value !== 0 && this.nimiqNetworkClient.head?.value?.height != null && this.timeout.value < this.nimiqNetworkClient.head?.value?.height)
  public readonly transactions: Ref<any[]> = ref([])

  private pendingPayment: PendingPayment | null = null
  private nextAddress: Nimiq.Address | null = null

  constructor(private nimiqWallet: NimiqWallet, private nimiqNetworkClient: NimiqNetworkClient, private instantPayClient: InstantPayClient, private storageManager: StorageManager) {
    // TODO
    (async () => {
      await nimiqNetworkClient.awaitInitialized()
      await this.updateWalletInfo()
      await this.updateReactive()
      const client = await nimiqNetworkClient.getClient()
      await client.addHeadChangedListener(async () => {
        await this.updateWalletInfo()
        await this.updateReactive()
      })
    })();
    (async () => {
      await this.updateReactive()
      await this.updateWalletInfo()
      await this.updateReactive()
    })()
  }

  private async updateReactive() {
    this.ready.value = await this.isReady()

    let wallets = await this.storageManager.query('SELECT id, balance, start, end FROM wl WHERE type = ? AND status = ?', [WalletType.INSTANT, WalletStatus.ACTIVE])
    if (wallets.length === 0)
      wallets = await this.storageManager.query('SELECT id, balance, start, end FROM wl WHERE type = ? AND status = ?', [WalletType.INSTANT, WalletStatus.PENDING])

    if (wallets.length === 0) {
      const wallet = await this.getWallet()
      wallets = [{ id: wallet.address, balance: wallet.balance, start: wallet.validityStart, end: wallet.validityEnd }]
    }

    this.balanceRaw.value = wallets[0].balance || 0
    this.validityStart.value = wallets[0].start || 0
    this.validityEnd.value = wallets[0].end || 0

    // eslint-disable-next-line no-console
    console.groupCollapsed(`🛒 Transactions`)
    const transactions = await this.storageManager.query('SELECT * FROM tx WHERE type = ? ORDER BY ts DESC', [TransactionType.PAYMENT])
    // eslint-disable-next-line no-console
    console.log('Transactions from DB', transactions)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today.getTime() - 1)
    yesterday.setHours(0, 0, 0, 0)
    // TODO: don't update if not necessary, this causes extra re-renders
    this.transactions.value = transactions.map((tx) => {
      const date = new Date(tx.ts * 1000)
      let txTypeName = null
      switch (tx.type) {
        case TransactionType.PAYMENT:
          txTypeName = 'Payment'
          break
      }
      return {
        title: tx.peerName ?? txTypeName ?? (`${tx.peerId.substring(0, 9)}…`),
        datetime: tx.status === TransactionStatus.PENDING ? 'Pending' : date.getTime() > today.getTime() ? 'Today' : date.getTime() > yesterday.getTime() ? 'Yesterday' : date.toLocaleDateString(),
        ...tx,
      }
    })
    // eslint-disable-next-line no-console
    console.log('Transactions', this.transactions.value)
    // eslint-disable-next-line no-console
    console.groupEnd()

    if (wallets[0].id) {
      const address = Nimiq.Address.fromString(wallets[0].id)
      this.address.value = address
      if (this.address.value == null && address != null || this.address.value != null && (address == null || !this.address.value.equals(address))) {
        if (address != null) {
          const account = await this.nimiqNetworkClient.getAccount(address)
          this.timeout.value = account instanceof Nimiq.HashedTimeLockedContract ? account.timeout : Number.MAX_VALUE
        }
        else {
          this.timeout.value = Number.MAX_VALUE
        }
      }
    }
  }

  private isStatusReady(status: InstantPayStatus, ourBlockHeight: number) {
    if (status.status !== 'good') {
      // eslint-disable-next-line no-console
      console.groupCollapsed('🎛️ InstantPay Server Status')
      // eslint-disable-next-line no-console
      console.log('Not ready', status)
      // eslint-disable-next-line no-console
      console.groupEnd()
    }
    return status.status === 'good' && status.blockHeight > ourBlockHeight - MAX_BLOCK_HEIGHT_MISMATCH && status.blockHeight < ourBlockHeight + MAX_BLOCK_HEIGHT_MISMATCH
  }

  private isValid(headHeight: number | undefined, validityStart: number, validityEnd: number) {
    return headHeight !== undefined && validityStart < headHeight && validityEnd > headHeight
  }

  async isReady() {
    const status = await this.instantPayClient.getStatus()
    const ourBlockHeight = await this.nimiqNetworkClient.getHeadHeightOrPending()
    return this.isStatusReady(status, ourBlockHeight)
  }

  private async getReadyStatus() {
    const status = await this.instantPayClient.getStatus()
    const ourBlockHeight = await this.nimiqNetworkClient.getHeadHeight()
    if (!this.isStatusReady(status, ourBlockHeight))
      throw new Error('Not ready')
    return status
  }

  async getWallet() {
    // TODO store locally
    if (this.nextAddress != null) {
      const nextWallet = await this.instantPayClient.getWallet(this.nextAddress)
      if (nextWallet != null)
        return nextWallet
    }
    const wallet = await this.nimiqWallet.getWallet()
    return this.instantPayClient.getWallet(wallet.address)
  }

  async updateWalletInfo() {
    const status = await this.instantPayClient.getStatus()
    const ourBlockHeight = await this.nimiqNetworkClient.getHeadHeight()
    if (!this.isStatusReady(status, ourBlockHeight)) {
      console.log('Wallet update not possible, not ready')
      return
    }
    const wallets = await this.storageManager.query('SELECT id, start, end, status FROM wl WHERE type = ? AND (status = ? OR status = ?)', [WalletType.INSTANT, WalletStatus.PENDING, WalletStatus.ACTIVE])
    console.log(wallets)
    for (const wallet of wallets) {
      if (wallet.status == WalletStatus.PENDING) {
        const instantWallet = await this.instantPayClient.getWallet(wallet.id)
        if (instantWallet != null) {
          await this.storageManager.run(
            'UPDATE wl SET status = ?, start = ?, end = ?, proofSize = ? WHERE id = ?',
            [WalletStatus.ACTIVE, instantWallet.validityStart, instantWallet.validityEnd, instantWallet.serviceSignatureProofSize, instantWallet.address],
          )
        }
      }
      if (wallet.status == WalletStatus.ACTIVE && wallet.end - (wallet.end - wallet.start) / 2 < ourBlockHeight + MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND) {
        try {
          await this.extend()
        }
        catch (e) {
          console.log('Automatic extend failed.', e)
        }
      }
    }
  }

  preparePayment(payment: PendingPayment) {
    if (this.pendingPayment != null)
      throw new Error('Payment pending')
    this.pendingPayment = payment
    // TODO: Get more details from payment rail where possible
  }

  getPendingPayment(): PendingPayment | null {
    return this.pendingPayment
  }

  cancelPendingPayment() {
    this.pendingPayment = null
  }

  async completePendingPayment(payment: PendingPayment) {
    if (this.pendingPayment !== payment)
      throw new Error('Unexpected pending payment')
    const tx = await this.pay(payment.address, payment.amount, payment.message)
    await this.storageManager.run(
      'UPDATE tx SET peerName = ?, rail = ?, railId = ?, railPeerId = ?, details = ?, fee = ?, fiatAmount = ?, fiatUnit = ? WHERE id = ?',
      [payment.label, payment.rail, payment.railId, payment.railPeerId, payment.details, payment.fee, payment.fiatAmount, payment.fiatUnit, tx.transactionHash.toHex()],
    )
    this.pendingPayment = null
    await this.updateReactive()
  }

  private createDepositData(status: InstantPayStatus, wallet: Nimiq.Wallet) {
    const data = new Nimiq.SerialBuffer(78)
    wallet.address.serialize(data)
    Nimiq.PublicKey.fromAny(status.servicePublicKey).toAddress().serialize(data)
    data.writeUint8(Nimiq.Hash.Algorithm.BLAKE2B)
    data.write(new Uint8Array(32))
    data.writeUint8(1)
    data.writeUint32(status.blockHeight + 60 * 24 * 14)
    return data
  }

  private createEarlyResolveProof(wallet: Nimiq.Wallet, tx: Nimiq.Transaction, instantWallet: InstantPayWalletState) {
    const sig = wallet.signTransaction(tx).serialize()
    const proof = new Nimiq.SerialBuffer(1 + sig.length + instantWallet.serviceSignatureProofSize)
    proof.writeUint8(Nimiq.HashedTimeLockedContract.ProofType.EARLY_RESOLVE)
    proof.writePos += instantWallet.serviceSignatureProofSize
    proof.write(sig)
    return proof
  }

  private createTimeoutResolveProof(wallet: Nimiq.Wallet, tx: Nimiq.Transaction) {
    const sig = wallet.signTransaction(tx).serialize()
    const proof = new Nimiq.SerialBuffer(1 + sig.length)
    proof.writeUint8(Nimiq.HashedTimeLockedContract.ProofType.TIMEOUT_RESOLVE)
    proof.write(sig)
    return proof
  }

  async deposit(amount: number) {
    console.log(`Deposit ${amount / 100000} to instant wallet`)
    const status = await this.getReadyStatus()
    const wallet = await this.nimiqWallet.getWallet()
    const tx = new Nimiq.ExtendedTransaction(
      wallet.address,
      Nimiq.Account.Type.BASIC,
      Nimiq.Address.CONTRACT_CREATION,
      Nimiq.Account.Type.HTLC,
      amount,
      0,
      status.blockHeight,
      Nimiq.Transaction.Flag.CONTRACT_CREATION,
      this.createDepositData(status, wallet),
    )
    tx.proof = wallet.signTransaction(tx).serialize()
    this.nextAddress = tx.recipient
    console.log(`New instant wallet address: ${this.nextAddress.toUserFriendlyAddress()}`)
    await this.nimiqNetworkClient.sendTransaction(tx)
    await this.storageManager.run(
      'INSERT OR REPLACE INTO tx(id, type, ts, amount, status, wlId, peerId, raw) VALUES (?,?,?,?,?,?,?,?)',
      [tx.hash().toHex(), TransactionType.DEPOSIT_TO_INSTANT, Date.now() / 1000, tx.value, TransactionStatus.PENDING, tx.sender.toUserFriendlyAddress(), tx.recipient.toUserFriendlyAddress(), Nimiq.BufferUtils.toHex(tx.serializeContent())],
    )
    await this.storageManager.run(
      'INSERT OR REPLACE INTO wl(id, type, status, balance) VALUES (?,?,?,?)',
      [tx.recipient.toUserFriendlyAddress(), WalletType.INSTANT, WalletStatus.PENDING, tx.value],
    )
  }

  async pay(recipient: Nimiq.Address, amount: number, message: string | null = null): Promise<Nimiq.ClientTransactionDetails> {
    console.log(`Send ${amount / 100000} to ${recipient.toUserFriendlyAddress()}`)
    const status = await this.getReadyStatus()
    const instantWallet = await this.getWallet()
    return this.sendTransactionInternal(status, instantWallet, recipient, amount, TransactionType.PAYMENT, message)
  }

  async recover() {
    console.log('Recover funds from instant wallet')
    const status = await this.instantPayClient.getStatus()
    const ourBlockHeight = await this.nimiqNetworkClient.getHeadHeight()
    const wallet = await this.nimiqWallet.getWallet()
    const instantWallet = await this.getWallet()
    const account = await this.nimiqNetworkClient.getAccount(instantWallet.address)
    if (this.isStatusReady(status, ourBlockHeight) && this.isValid(ourBlockHeight, instantWallet.validityStart, instantWallet.validityEnd)) {
      await this.sendTransactionInternal(status, instantWallet, wallet.address, instantWallet.balance, TransactionType.RECOVER_INSTANT)
    }
    else if (account instanceof Nimiq.HashedTimeLockedContract && account.timeout < ourBlockHeight) {
      const tx = new Nimiq.ExtendedTransaction(
        Nimiq.Address.fromString(instantWallet.address),
        Nimiq.Account.Type.HTLC,
        wallet.address,
        Nimiq.Account.Type.BASIC,
        account.balance,
        0,
        status.blockHeight,
        0,
        new Uint8Array(0),
      )
      tx.proof = this.createTimeoutResolveProof(wallet, tx)
      await this.nimiqNetworkClient.sendTransaction(tx)
      await this.storageManager.run(
        'INSERT OR REPLACE INTO tx(id, type, ts, amount, status, wlId, peerId, raw) VALUES (?,?,?,?,?,?,?,?)',
        [tx.hash().toHex(), TransactionType.RECOVER_INSTANT, Date.now() / 1000, tx.value, TransactionStatus.PENDING, tx.sender.toUserFriendlyAddress(), tx.recipient.toUserFriendlyAddress(), Nimiq.BufferUtils.toHex(tx.serializeContent())],
      )
    }
    else {
      throw new Error('Recover currently not possible')
    }
  }

  async extend() {
    console.log('Extending instant wallet validity')
    const status = await this.instantPayClient.getStatus()
    const ourBlockHeight = await this.nimiqNetworkClient.getHeadHeight()
    const wallet = await this.nimiqWallet.getWallet()
    const instantWallet = await this.getWallet()
    const account = await this.nimiqNetworkClient.getAccount(instantWallet.address)
    const tx = new Nimiq.ExtendedTransaction(
      Nimiq.Address.fromString(instantWallet.address),
      Nimiq.Account.Type.HTLC,
      Nimiq.Address.CONTRACT_CREATION,
      Nimiq.Account.Type.HTLC,
      instantWallet.balance,
      0,
      status.blockHeight,
      Nimiq.Transaction.Flag.CONTRACT_CREATION,
      this.createDepositData(status, wallet),
    )
    if (this.isStatusReady(status, ourBlockHeight) && this.isValid(ourBlockHeight, instantWallet.validityStart, instantWallet.validityEnd)) {
      tx.proof = this.createEarlyResolveProof(wallet, tx, instantWallet)
      const instantTransactionReceipt = await this.instantPayClient.sendTransaction(instantWallet.address, tx)
      const signedTransaction = Nimiq.Transaction.fromAny(instantTransactionReceipt.details)
      this.nextAddress = tx.recipient
      await this.nimiqNetworkClient.sendTransaction(signedTransaction)
      await this.storageManager.run(
        'INSERT OR REPLACE INTO tx(id, type, ts, amount, status, wlId, peerId, raw) VALUES (?,?,?,?,?,?,?,?)',
        [tx.hash().toHex(), TransactionType.EXTEND_INSTANT, Date.now() / 1000, tx.value, TransactionStatus.PENDING, tx.sender.toUserFriendlyAddress(), tx.recipient.toUserFriendlyAddress(), Nimiq.BufferUtils.toHex(signedTransaction.serializeContent())],
      )
    }
    else if (account instanceof Nimiq.HashedTimeLockedContract && account.timeout < ourBlockHeight) {
      tx.proof = this.createTimeoutResolveProof(wallet, tx)
      this.nextAddress = tx.recipient
      await this.nimiqNetworkClient.sendTransaction(tx)
      await this.storageManager.run(
        'INSERT OR REPLACE INTO tx(id, type, ts, amount, status, wlId, peerId, raw) VALUES (?,?,?,?,?,?,?,?)',
        [tx.hash().toHex(), TransactionType.EXTEND_INSTANT, Date.now() / 1000, tx.value, TransactionStatus.PENDING, tx.sender.toUserFriendlyAddress(), tx.recipient.toUserFriendlyAddress(), Nimiq.BufferUtils.toHex(tx.serializeContent())],
      )
    }
    await this.storageManager.run(
      'UPDATE wl SET balance = balance - ?, status = ? WHERE id = ?',
      [tx.value, WalletStatus.EMPTIED, tx.sender.toUserFriendlyAddress()],
    )
    await this.storageManager.run(
      'INSERT OR REPLACE INTO wl(id, type, status, balance) VALUES (?,?,?,?)',
      [tx.recipient.toUserFriendlyAddress(), WalletType.INSTANT, WalletStatus.PENDING, tx.value],
    )
  }

  private async sendTransactionInternal(status: InstantPayStatus, instantWallet: InstantPayWalletState, recipient: Nimiq.Address, amount: number, type: TransactionType = TransactionType.UNKNOWN, message: string | null = null): Promise<Nimiq.ClientTransactionDetails> {
    const wallet = await this.nimiqWallet.getWallet()
    const tx = new Nimiq.ExtendedTransaction(
      Nimiq.Address.fromString(instantWallet.address),
      Nimiq.Account.Type.HTLC,
      recipient,
      Nimiq.Account.Type.BASIC,
      amount,
      0,
      status.blockHeight,
      0,
      message == null ? new Uint8Array(0) : Nimiq.BufferUtils.fromAscii(message),
    )
    tx.proof = this.createEarlyResolveProof(wallet, tx, instantWallet)
    const instantTransactionReceipt = await this.instantPayClient.sendTransaction(instantWallet.address, tx)
    const signedTransaction = Nimiq.Transaction.fromAny(instantTransactionReceipt.details)
    const result = await this.nimiqNetworkClient.sendTransaction(signedTransaction)
    await this.storageManager.run(
      'INSERT OR REPLACE INTO tx(id, type, ts, amount, status, wlId, peerId, raw) VALUES (?,?,?,?,?,?,?,?)',
      [tx.hash().toHex(), type, Date.now() / 1000, tx.value, TransactionStatus.MINED, tx.sender.toUserFriendlyAddress(), tx.recipient.toUserFriendlyAddress(), Nimiq.BufferUtils.toHex(signedTransaction.serializeContent())],
    )
    await this.storageManager.run(
      'UPDATE wl SET balance = balance - ? WHERE id = ?',
      [tx.value, tx.sender.toUserFriendlyAddress()],
    )
    return result
  }

  static KEY: InjectionKey<InstantPayWallet> = Symbol(InstantPayWallet.name)
}
