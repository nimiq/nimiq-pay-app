import { BonusClient, VoucherInfoResponse } from "./bonus-client";
import { StorageManager, StorageKey } from "./storage-manager";
import { NimiqWallet } from "./nimiq-wallet";
import { InjectionKey } from "vue";

interface BonusStorage {
    token?: string;
    phoneNumber?: string;
    ownPromoCode?: string;
}

const BonusStorageKey = { name: "bonus" } as StorageKey<BonusStorage>

export class BonusWallet {
    private accessCode: string | null = null
    private promoCode: string | null = null
    private phoneNumber: string | null = null

    constructor(private nimiqWallet: NimiqWallet, private storageManager: StorageManager, private bonusClient: BonusClient) {
    }
    async authorize(phoneNumber: string) {
        const wallet = await this.nimiqWallet.getWallet()
        this.accessCode = await this.bonusClient.authorizeParticipant(wallet.publicKey, phoneNumber)
        this.phoneNumber = phoneNumber
    }

    async verify(accessCode: string) {
        if (this.phoneNumber == null) throw 'No authorization in process'
        const response = await this.bonusClient.verifyParticipant(this.phoneNumber, accessCode)
        await this.storageManager.update(BonusStorageKey, (storage) => storage.token = response.token)
        if (this.promoCode != null) {
            try {
                this.redeemVoucher(this.promoCode)
                this.promoCode = null
            } catch (e) {
                // Ignore
            }
        }
    }

    getPrefillAccessCode(): string | null {
        return this.accessCode
    }

    async getTasks(): Promise<any[]> {
        return this.bonusClient.getTasks(await this.getToken())
    }

    async getTask(id: string): Promise<any> {
        return this.bonusClient.getTask(await this.getToken(), id)
    }

    async getVoucherInfo(code: string): Promise<VoucherInfoResponse> {
        return this.bonusClient.getVoucher(code)
    }

    async redeemVoucher(code: string) {
        await this.bonusClient.claimVoucher(await this.getToken(), code)
    }

    async getReferralVoucherInfo(): Promise<VoucherInfoResponse> {
        return this.bonusClient.getParticipantVoucher(await this.getToken())
    }

    async setPromoCode(code: string) {
        await this.bonusClient.getVoucher(code)
        this.promoCode = code
    }

    async isRegistered(): Promise<boolean> {
        return !!(await this.storageManager.get(BonusStorageKey))?.token
    }

    private async getToken(): Promise<string> {
        let token = (await this.storageManager.get(BonusStorageKey))?.token
        if (!token) throw 'Not registered'
        return token
    }

    static KEY: InjectionKey<BonusWallet> = Symbol(BonusWallet.name)
}