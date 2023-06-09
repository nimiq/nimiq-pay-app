export interface InstantPayStatus {
    status: string;
    blockHeight: number;
    servicePublicKey: string;
    network: string;
}

export interface InstantPayPlainTransaction {
    format: string;
    sender: string;
    senderType: string | number;
    recipient: string;
    recipientType: string | number;
    value: number;
    fee: number;
    validityStartHeight: number;
    flags: number | undefined;
    data: string | { raw: string };
    proof: string | { raw: string };
    network: string | number;
}

export interface InstantPayTransaction {
    hash: string;
    blockHash: string;
    details: InstantPayPlainTransaction;
}

export interface InstantPayWalletState {
    address: string;
    servicePublicKey: string;
    serviceSignatureProofSize: number;
    validityStart: number;
    validityEnd: number;
    balance: number;
}

export class InstantPayClient {
    endpoint: string = "https://pay-test-cos.nim.sh";

    private async fetchJson(path: string, options: RequestInit = {}): Promise<any | null> {
        try {
            const response = await fetch(this.endpoint + path, options);
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
            return await response.json();
        } catch (e: any) {
            throw new Error(`Request to ${path} failed: ${e.message}`, { cause: e });
        }
    }

    async getStatus() {
        return (await this.fetchJson("/status")) as InstantPayStatus
    }

    async getTransaction(hash: Nimiq.Hash | Uint8Array | string) {
        return (await this.fetchJson(`/tx/${Nimiq.Hash.fromAny(hash).toHex()}`)) as InstantPayTransaction
    }

    async getWallet(address: Nimiq.Address | string) {
        return (await this.fetchJson(`/wallet/${Nimiq.Address.fromAny(address).toUserFriendlyAddress(false)}`)) as InstantPayWalletState
    }

    async getWalletTransactions(address: Nimiq.Address | string) {
        return (await this.fetchJson(`/wallet/${Nimiq.Address.fromAny(address).toUserFriendlyAddress(false)}/txs`)) as InstantPayTransaction[]
    }

    async sendTransaction(address: Nimiq.Address | string, tx: Nimiq.Transaction | string | object) {
        const inTransaction = Nimiq.Transaction.fromAny(tx)
        return (await this.fetchJson(`/wallet/${Nimiq.Address.fromAny(address).toUserFriendlyAddress(false)}/send-tx`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inTransaction.toPlain())
        })) as InstantPayTransaction
    }

    async sendRawTransaction(address: Nimiq.Address | string, tx: string) {
        return (await this.fetchJson(`/wallet/${Nimiq.Address.fromAny(address).toUserFriendlyAddress(false)}/send-raw-tx`, {
            method: "POST", headers: { "Content-Type": "text/plain" }, body: tx
        })) as InstantPayTransaction
    }
}