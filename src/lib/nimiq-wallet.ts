import type { InjectionKey, Ref } from 'vue'
import { App, computed, ref, shallowRef } from 'vue'
import type { StorageKey, StorageManager } from './storage-manager'
import { TransactionStatus, WalletStatus, WalletType } from './storage-manager'
import type { NimiqNetworkClient } from '@/lib/nimiq-network-client'

interface WalletStorage {
  privatekeyString?: string
  entropy?: string
}

const WalletStorageKey = { name: 'wallet' } as StorageKey<WalletStorage>
const REQUIRED_BLOCK_CONFIRMATIONS = 10
const UNLOCK_TIMEOUT = 5 * 60 * 1000

export class NimiqWallet {
  private readonly privateKeyPromise: Promise<Nimiq.PrivateKey>
  private readonly walletPromise: Promise<Nimiq.Wallet>
  public readonly initialized: Ref<boolean> = ref(false)
  public readonly address: Ref<Nimiq.Address | undefined> = ref(undefined)
  public readonly balanceRaw: Ref<number> = ref(0)
  public readonly balance: Ref<number> = computed(() => this.balanceRaw.value / 100000)

  constructor(private nimiqNetworkClient: NimiqNetworkClient, private storageManager: StorageManager) {
    this.privateKeyPromise = (async () => {
      const storage = await this.storageManager.get(WalletStorageKey)
      if (storage.privatekeyString == null) {
        const entropy = Nimiq.Entropy.generate()
        storage.entropy = entropy.toHex().substring(0, 32)
        storage.privatekeyString = Nimiq.PrivateKey.generate().toHex()
        await this.storageManager.update(WalletStorageKey, (newStorage) => {
          newStorage.privatekeyString = storage.privatekeyString
          newStorage.entropy = storage.entropy
        })
      }
      return Nimiq.PrivateKey.unserialize(Nimiq.BufferUtils.fromHex(storage.privatekeyString))
    })()
    const walletPromise = this.walletPromise = nimiqNetworkClient.awaitInitialized().then(async () => {
      const privateKey = await this.privateKeyPromise
      const wallet = new Nimiq.Wallet(Nimiq.KeyPair.derive(privateKey))
      this.address.value = wallet.address
      return wallet
    });
    (async () => {
      const client = await this.nimiqNetworkClient.getClient()
      const wallet = await walletPromise
      await client.addHeadChangedListener(async () => {
        const account = await client.getAccount(wallet.address)
        this.balanceRaw.value = account.balance
        await this.storageManager.run(
          'INSERT OR REPLACE INTO wl(id, type, status, balance) VALUES (?,?,?,?)',
          [wallet.address.toUserFriendlyAddress(), WalletType.RAW, WalletStatus.ACTIVE, account.balance],
        )
        const pendingTransactions = await this.storageManager.query('SELECT id FROM tx WHERE status = ? OR status = ?', [TransactionStatus.PENDING, TransactionStatus.MINED])
        if (pendingTransactions.length > 0) {
          const receipts = await nimiqNetworkClient.getTransactionReceipts(pendingTransactions.map(tx => tx.id))
          const currentHeadHeight = await nimiqNetworkClient.getHeadHeight()
          for (const receipt of receipts) {
            await this.storageManager.run(
              'UPDATE tx SET status = ?, block = ?, blockHeight = ? WHERE id = ?',
              [receipt.blockHeight > currentHeadHeight + REQUIRED_BLOCK_CONFIRMATIONS ? TransactionStatus.CONFIRMED : TransactionStatus.MINED, receipt.blockHash.toHex(), receipt.blockHeight, receipt.transactionHash.toHex()],
            )
          }
        }
      })
      this.initialized.value = true
    })()
    async () => {
      const wallets = await this.storageManager.query('SELECT id, balance FROM wl WHERE type = ?', [WalletType.RAW])
      this.address.value = wallets[0].id
      this.balanceRaw.value = wallets[0].balance
    }
  }

  isReady(): boolean {
    return this.initialized.value && this.storageManager.getLastUnlocked() > Date.now() - UNLOCK_TIMEOUT
  }

  async getWallet(): Promise<Nimiq.Wallet> {
    return this.walletPromise
  }

  async getWords(): Promise<string[]> {
    await this.walletPromise
    const storage = await this.storageManager.get(WalletStorageKey)
    if (storage.entropy === undefined)
      return []
    return Nimiq.MnemonicUtils.entropyToMnemonic(storage.entropy)
  }

  static KEY: InjectionKey<NimiqWallet> = Symbol(NimiqWallet.name)
}
