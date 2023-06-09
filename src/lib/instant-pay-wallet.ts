import { InstantPayClient, InstantPayStatus, InstantPayWalletState } from "@/lib/instant-pay-client";
import { NimiqNetworkClient } from "@/lib/nimiq-network-client";
import { NimiqWallet } from "@/lib/nimiq-wallet";
import { computed, InjectionKey, Ref, ref } from "vue";

const MAX_BLOCK_HEIGHT_MISMATCH = 5

export class InstantPayWallet {
    public readonly ready: Ref<boolean> = ref(false)
    public readonly address: Ref<Nimiq.Address | null> = ref(null)
    public readonly balanceRaw: Ref<number> = ref(0)
    public readonly balance: Ref<number> = computed(() => this.balanceRaw.value / 100000)
    public readonly validityStart: Ref<number> = ref(0)
    public readonly validityEnd: Ref<number> = ref(0)
    public readonly timeout: Ref<number> = ref(Number.MAX_VALUE)
    public readonly valid: Ref<boolean> = computed(() => this.isValid(this.nimiqNetworkClient.head?.value?.height, this.validityStart.value, this.validityEnd.value))
    public readonly timeouted: Ref<boolean> = computed(() => this.timeout.value != 0 && this.nimiqNetworkClient.head?.value?.height != null && this.timeout.value < this.nimiqNetworkClient.head?.value?.height)

    private nextAddress: Nimiq.Address | null = null

    constructor(private nimiqWallet: NimiqWallet, private nimiqNetworkClient: NimiqNetworkClient, private instantPayClient: InstantPayClient) {
        // TODO
        (async () => {
            await nimiqNetworkClient.awaitInitialized()
            await this.updateReactive()
            const client = await nimiqNetworkClient.getClient()
            await client.addHeadChangedListener(async () => {
                await this.updateReactive()
            })
        })();
    }

    private async updateReactive() {
        this.ready.value = await this.isReady()
        const instantWallet = await this.getWallet()
        const address = instantWallet != null ? Nimiq.Address.fromString(instantWallet.address) : null
        if (this.address.value == null && address != null || this.address.value != null && (address == null || !this.address.value.equals(address))) {
            if (address != null) {
                const account = await this.nimiqNetworkClient.getAccount(address)
                this.timeout.value = account instanceof Nimiq.HashedTimeLockedContract ? account.timeout : Number.MAX_VALUE
            } else {
                this.timeout.value = Number.MAX_VALUE
            }
        }
        this.address.value = address
        this.balanceRaw.value = instantWallet?.balance || 0
        this.validityStart.value = instantWallet?.validityStart || 0
        this.validityEnd.value = instantWallet?.validityEnd || 0
    }

    private isStatusReady(status: InstantPayStatus, ourBlockHeight: number) {
        return status.status === 'good' && status.blockHeight > ourBlockHeight - MAX_BLOCK_HEIGHT_MISMATCH && status.blockHeight < ourBlockHeight + MAX_BLOCK_HEIGHT_MISMATCH
    }

    private isValid(headHeight: number | undefined, validityStart: number, validityEnd: number) {
        return headHeight != undefined && validityStart < headHeight && validityEnd > headHeight
    }

    async isReady() {
        const status = await this.instantPayClient.getStatus()
        const ourBlockHeight = await this.nimiqNetworkClient.getHeadHeight()
        return this.isStatusReady(status, ourBlockHeight)
    }

    private async getReadyStatus() {
        const status = await this.instantPayClient.getStatus()
        const ourBlockHeight = await this.nimiqNetworkClient.getHeadHeight()
        if (!this.isStatusReady(status, ourBlockHeight)) throw new Error("Not ready")
        return status
    }

    async getWallet() {
        // TODO store locally
        if (this.nextAddress != null) {
            const nextWallet = await this.instantPayClient.getWallet(this.nextAddress)
            if (nextWallet != null) {
                return nextWallet
            }
        }
        const wallet = await this.nimiqWallet.getWallet()
        return this.instantPayClient.getWallet(wallet.address)
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
        const status = await this.instantPayClient.getStatus()
        const wallet = await this.nimiqWallet.getWallet()
        const tx = new Nimiq.ExtendedTransaction(
            wallet.address, Nimiq.Account.Type.BASIC,
            Nimiq.Address.CONTRACT_CREATION, Nimiq.Account.Type.HTLC,
            amount, 0,
            status.blockHeight, Nimiq.Transaction.Flag.CONTRACT_CREATION,
            this.createDepositData(status, wallet)
        )
        tx.proof = wallet.signTransaction(tx).serialize()
        this.nextAddress = tx.recipient
        console.log(`New instant wallet address: ${this.nextAddress.toUserFriendlyAddress()}`)
        return await this.nimiqNetworkClient.sendTransaction(tx)
    }

    async sendTransaction(recipient: Nimiq.Address, amount: number) {
        console.log(`Send ${amount / 100000} to ${recipient.toUserFriendlyAddress()}`)
        const status = await this.getReadyStatus()
        const instantWallet = await this.getWallet()
        return this.sendTransactionInternal(status, instantWallet, recipient, amount)
    }

    async recover() {
        console.log("Recover funds from instant wallet")
        const status = await this.instantPayClient.getStatus()
        const ourBlockHeight = await this.nimiqNetworkClient.getHeadHeight()
        const wallet = await this.nimiqWallet.getWallet()
        const instantWallet = await this.getWallet()
        const account = await this.nimiqNetworkClient.getAccount(instantWallet.address)
        if (this.isStatusReady(status, ourBlockHeight) && this.isValid(ourBlockHeight, instantWallet.validityStart, instantWallet.validityEnd)) {
            await this.sendTransactionInternal(status, instantWallet, wallet.address, instantWallet.balance)
        } else if (account instanceof Nimiq.HashedTimeLockedContract && account.timeout < ourBlockHeight) {
            const tx = new Nimiq.ExtendedTransaction(
                Nimiq.Address.fromString(instantWallet.address), Nimiq.Account.Type.HTLC,
                wallet.address, Nimiq.Account.Type.BASIC,
                account.balance, 0,
                status.blockHeight, 0,
                new Uint8Array(0)
            )
            tx.proof = this.createTimeoutResolveProof(wallet, tx)
            return await this.nimiqNetworkClient.sendTransaction(tx)
        }
    }

    async extend() {
        console.log("Extending instant wallet validity")
        const status = await this.instantPayClient.getStatus()
        const ourBlockHeight = await this.nimiqNetworkClient.getHeadHeight()
        const wallet = await this.nimiqWallet.getWallet()
        const instantWallet = await this.getWallet()
        const account = await this.nimiqNetworkClient.getAccount(instantWallet.address)
        const tx = new Nimiq.ExtendedTransaction(
            Nimiq.Address.fromString(instantWallet.address), Nimiq.Account.Type.HTLC,
            Nimiq.Address.CONTRACT_CREATION, Nimiq.Account.Type.HTLC,
            instantWallet.balance, 0,
            status.blockHeight, Nimiq.Transaction.Flag.CONTRACT_CREATION,
            this.createDepositData(status, wallet)
        )
        if (this.isStatusReady(status, ourBlockHeight) && this.isValid(ourBlockHeight, instantWallet.validityStart, instantWallet.validityEnd)) {
            tx.proof = this.createEarlyResolveProof(wallet, tx, instantWallet)
            const instantTransactionReceipt = await this.instantPayClient.sendTransaction(instantWallet.address, tx)
            const signedTransaction = Nimiq.Transaction.fromAny(instantTransactionReceipt.details)
            this.nextAddress = tx.recipient
            return await this.nimiqNetworkClient.sendTransaction(signedTransaction)
        } else if (account instanceof Nimiq.HashedTimeLockedContract && account.timeout < ourBlockHeight) {
            tx.proof = this.createTimeoutResolveProof(wallet, tx)
            this.nextAddress = tx.recipient
            return await this.nimiqNetworkClient.sendTransaction(tx)
        }
    }

    private async sendTransactionInternal(status: InstantPayStatus, instantWallet: InstantPayWalletState, recipient: Nimiq.Address, amount: number) {
        const wallet = await this.nimiqWallet.getWallet()
        const tx = new Nimiq.ExtendedTransaction(
            Nimiq.Address.fromString(instantWallet.address), Nimiq.Account.Type.HTLC,
            recipient, Nimiq.Account.Type.BASIC,
            amount, 0,
            status.blockHeight, 0,
            new Uint8Array(0)
        )
        tx.proof = this.createEarlyResolveProof(wallet, tx, instantWallet)
        const instantTransactionReceipt = await this.instantPayClient.sendTransaction(instantWallet.address, tx)
        const signedTransaction = Nimiq.Transaction.fromAny(instantTransactionReceipt.details)
        return await this.nimiqNetworkClient.sendTransaction(signedTransaction)
    }

    static KEY: InjectionKey<InstantPayWallet> = Symbol(InstantPayWallet.name)
}