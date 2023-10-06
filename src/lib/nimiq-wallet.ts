import type { InjectionKey, Ref } from 'vue'
import { computed, ref } from 'vue'
import type { StorageKey, StorageManager } from './storage-manager'
import type { NimiqNetworkClient } from '@/lib/nimiq-network-client'

interface WalletStorage {
  privatekeyString?: string
}

const WalletStorageKey = { name: 'wallet' } as StorageKey<WalletStorage>

export class NimiqWallet {
  private readonly privateKeyPromise: Promise<Nimiq.PrivateKey>
  private readonly walletPromise: Promise<Nimiq.Wallet>
  public readonly initialized: Ref<boolean> = ref(false)
  public readonly address: Ref<Nimiq.Address | null> = ref(null)
  public readonly balanceRaw: Ref<number> = ref(0)
  public readonly balance: Ref<number> = computed(() => this.balanceRaw.value / 100000)

  constructor(private nimiqNetworkClient: NimiqNetworkClient, private storageManager: StorageManager) {
    this.privateKeyPromise = (async () => {
      const storage = await this.storageManager.get(WalletStorageKey)
      if (storage.privatekeyString == null) {
        storage.privatekeyString = Nimiq.PrivateKey.generate().toHex()
        await this.storageManager.update(WalletStorageKey, newStorage => newStorage.privatekeyString = storage.privatekeyString)
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
      })
      this.initialized.value = true
    })()
  }

  async getWallet(): Promise<Nimiq.Wallet> {
    return this.walletPromise
  }

  static KEY: InjectionKey<NimiqWallet> = Symbol(NimiqWallet.name)
}
