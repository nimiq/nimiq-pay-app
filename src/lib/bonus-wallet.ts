import { computed, ref } from 'vue'
import { computedAsync } from '@vueuse/core'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { BonusClient, TaskClaimResponse, VoucherInfoResponse } from './bonus-client'
import type { StorageKey, StorageManager } from './storage-manager'
import type { NimiqWallet } from './nimiq-wallet'

interface BonusStorage {
  token?: string
  phoneNumber?: string
  ownPromoCode?: string
  refererPromoCode?: string
  isRefererClaimed?: boolean
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
    try {
      const response = await this.bonusClient.verifyParticipant(this.phoneNumber.value, accessCode)
      await this.storageManager.update(BonusStorageKey, storage => storage.token = response.token)
      await this.checkDelayedRedeemVoucher()
    }
    catch (e) {
      this.phoneNumber.value = null
      throw e
    }
  }

  getPrefillAccessCode(): string | null {
    return this.accessCode
  }

  async getParticipantBalance(): Promise<number> {
    return this.bonusClient.getParticipantBalance(await this.getToken())
  }

  async getTasks(): Promise<any[]> {
    return this.bonusClient.getTasks(await this.getToken())
  }

  async getTask(id: string): Promise<any> {
    return this.bonusClient.getTask(await this.getToken(), id)
  }

  async claimTask(id: string, proof: any): Promise<TaskClaimResponse> {
    return await this.bonusClient.claimTask(await this.getToken(), id, proof)
  }

  async getVoucherInfo(code: string): Promise<VoucherInfoResponse> {
    return this.bonusClient.getVoucher(code)
  }

  async delayRedeemVoucher(code: string) {
    this.promoCode.value = code
    this.storageManager.update(BonusStorageKey, (storage) => {
      storage.refererPromoCode = code
      storage.isRefererClaimed = false
    })
  }

  async checkDelayedRedeemVoucher() {
    try {
      console.groupCollapsed('🎁 Checking delayed voucher')
      const codePromise = this.storageManager.get(BonusStorageKey).then(storage => storage.refererPromoCode)
      const isClaimedPromise = this.storageManager.get(BonusStorageKey).then(storage => storage.isRefererClaimed)
      const [isClaimed, code] = await Promise.all([isClaimedPromise, codePromise])
      console.log('isClaimed', isClaimed)
      console.log('code', code)
      console.groupEnd()
      if (!code)
        return

      if (isClaimed)
        this.promoCode.value = code
      else
        await this.redeemVoucher(code)
    }
    catch (e) {
      console.error(e)
      console.groupEnd()
    }
  }

  async redeemVoucher(code: string) {
    await this.bonusClient.claimVoucher(await this.getToken(), code)
    this.promoCode.value = code
    this.storageManager.update(BonusStorageKey, (storage) => { storage.isRefererClaimed = true })
  }

  async getReferralVoucherInfo(): Promise<VoucherInfoResponse> {
    return this.bonusClient.getParticipantVoucher(await this.getToken())
  }

  async pay(type: string, reference: string, destination: string) {
    await this.bonusClient.doPayment(await this.getToken(), type, reference, destination)
  }

  async verifyPayment(type: string, reference: string, destination: string) {
    return await this.bonusClient.verifyPayment(await this.getToken(), type, reference, destination)
  }

  isRegistered(): Ref<boolean> {
    return computedAsync(async () => !!this.phoneNumber.value || !!(await this.storageManager.get(BonusStorageKey))?.token)
  }

  isPromoCodeEntered(): Ref<boolean> {
    return computedAsync(async () => !!this.promoCode.value && !!(await this.storageManager.get(BonusStorageKey).then(storage => storage.isRefererClaimed)))
  }

  private async getToken(): Promise<string> {
    const token = (await this.storageManager.get(BonusStorageKey))?.token
    if (!token)
      throw new Error('Not registered')
    return token
  }

  static KEY: InjectionKey<BonusWallet> = Symbol(BonusWallet.name)
}
