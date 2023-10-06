import { computed, ref } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import { computedAsync } from '@vueuse/core'
import type { BonusClient } from './bonus-client'
import type { StorageKey, StorageManager } from './storage-manager'
import type { NimiqWallet } from './nimiq-wallet'

interface BonusStorage {
  token?: string
  phoneNumber?: string
  ownPromoCode?: string
}

const BonusStorageKey = { name: 'bonus' } as StorageKey<BonusStorage>

export class BonusWallet {
  private accessCode: string | null = null
  private promoCode: Ref<string | null> = ref(null)
  private phoneNumber: Ref<string | null> = ref(null)

  constructor(private nimiqWallet: NimiqWallet, private storageManager: StorageManager, private bonusClient: BonusClient) {
  }

  async authorize(phoneNumber: string) {
    const wallet = await this.nimiqWallet.getWallet()
    this.accessCode = await this.bonusClient.authorizeParticipant(wallet.publicKey, phoneNumber)
    this.phoneNumber.value = phoneNumber
  }

  async verify(accessCode: number) {
    if (this.phoneNumber.value === null)
      throw new Error('No authorization in process')
    const response = await this.bonusClient.verifyParticipant(this.phoneNumber.value, accessCode)
    await this.storageManager.update(BonusStorageKey, storage => storage.token = response.token)
    if (this.promoCode.value !== null) {
      try {
        this.redeemVoucher(this.promoCode.value)
        this.promoCode.value = null
      }
      catch (e) {
        // Ignore
      }
    }
  }

  getPrefillAccessCode(): string | null {
    return this.accessCode
  }

  async redeemVoucher(code: string) {
    await this.bonusClient.claimVoucher(await this.getToken(), code)
  }

  async setPromoCode(code: string) {
    await this.bonusClient.getVoucher(code)
    this.promoCode.value = code
  }

  isRegistered(): Ref<boolean> {
    return computedAsync(async () => !!this.phoneNumber.value || !!(await this.storageManager.get(BonusStorageKey))?.token)
  }

  isPromoCodeEntered(): ComputedRef<boolean> {
    return computed(() => !!this.promoCode.value)
  }

  private async getToken(): Promise<string> {
    const token = (await this.storageManager.get(BonusStorageKey))?.token
    if (!token)
      throw new Error('Not registered')
    return token
  }

  static KEY: InjectionKey<BonusWallet> = Symbol(BonusWallet.name)
}
