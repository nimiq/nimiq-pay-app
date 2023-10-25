/* eslint-disable no-console */
import type { InjectionKey, Ref } from 'vue'
import { computed, ref } from 'vue'
import type { StorageKey, StorageManager } from './storage-manager'
import { TransactionStatus, WalletStatus, WalletType } from './storage-manager'
import type { NimiqNetworkClient } from '@/lib/nimiq-network-client'

interface WalletStorage {
  entropy?: string
}

const WalletStorageKey = { name: 'wallet' } as StorageKey<WalletStorage>
const REQUIRED_BLOCK_CONFIRMATIONS = 10
const UNLOCK_TIMEOUT = 5 * 60 * 1000

export class NimiqWallet {
  private readonly privateKeyPromise: Promise<Nimiq.PrivateKey>
  private readonly walletPromise: Promise<Nimiq.Wallet>
  private readonly backupEntropy: Ref<Nimiq.Entropy | undefined> = ref(undefined)
  public readonly initialized: Ref<boolean> = ref(false)
  public readonly address: Ref<Nimiq.Address | undefined> = ref(undefined)
  public readonly balanceRaw: Ref<number> = ref(0)
  public readonly balance: Ref<number> = computed(() => this.balanceRaw.value / 100000)

  constructor(private nimiqNetworkClient: NimiqNetworkClient, private storageManager: StorageManager) {
    this.privateKeyPromise = (async () => {
      let { entropy } = await this.storageManager.get(WalletStorageKey)
      console.groupCollapsed('🔑 Getting Private Key')
      console.log('Entropy:', entropy)
      if (!entropy) {
        if (this.backupEntropy.value) {
          console.log('⚠️ Using backup entropy ⚠️')
          entropy = this.backupEntropy.value.toHex()
        }
        else {
          console.log('⚠️ Generating new wallet ⚠️')
          // eslint-disable-next-line ts/ban-ts-comment
          // @ts-expect-error
          Nimiq.Entropy.SIZE = 16
          entropy = Nimiq.Entropy.generate().toHex().substring(0, 32)
        }
        console.groupEnd()
        await this.storageManager.update(WalletStorageKey, (newStorage) => {
          newStorage.entropy = entropy
        })
      }
      const mnemonic = Nimiq.MnemonicUtils.entropyToMnemonic(entropy)
      console.groupEnd()
      return Nimiq.MnemonicUtils.mnemonicToExtendedPrivateKey(mnemonic).derivePath(`m/44'/242'/0'/0'`).privateKey
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
  }

  isReady(): boolean {
    return this.initialized.value && this.storageManager.getLastUnlocked() > Date.now() - UNLOCK_TIMEOUT
  }

  async getWallet(): Promise<Nimiq.Wallet> {
    return this.walletPromise
  }

  async getWords(): Promise<string[]> {
    console.groupCollapsed('💾 Backup')
    await this.walletPromise
    const storage = await this.storageManager.get(WalletStorageKey)
    console.log(storage)
    if (storage.entropy === undefined)
      return []
    console.groupEnd()
    return Nimiq.MnemonicUtils.entropyToMnemonic(storage.entropy)
  }

  importBackup(mnemonic: string | string[]): void {
    console.groupCollapsed('💾 Import Backup')
    try {
      // eslint-disable-next-line ts/ban-ts-comment
      // @ts-expect-error
      Nimiq.Entropy.SIZE = 16
      const entropy = Nimiq.MnemonicUtils.mnemonicToEntropy(mnemonic)
      console.log('Entropy:', entropy.toHex())
      this.backupEntropy.value = entropy
      this.storageManager.setBackupDone(true)
      console.groupEnd()
    }
    catch (e) {
      console.error(e)
      console.groupEnd()
      throw e
    }
  }

  static KEY: InjectionKey<NimiqWallet> = Symbol(NimiqWallet.name)
}
