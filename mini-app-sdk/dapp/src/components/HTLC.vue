<script setup lang="ts">
import type { NimiqProvider } from '@nimiq/mini-app-sdk'
import { computed, onUnmounted, ref, watch } from 'vue';

interface Account {
    address: string;
    balance: number;
    type: 'basic' | 'vesting' | 'htlc' | 'staking';
}

interface HTLContract {
    address: string;
    balance: number;
    type: 'htlc';
    sender: string;
    recipient: string;
    hashRoot: {
        algorithm: 'blake2b' | 'sha256' | 'sha512';
        hash: string;
    };
    hashCount: number;
    timeout: number;
    totalAmount: number;
}

const props = defineProps<{
    provider: NimiqProvider | null;
    isInitializing: boolean;
    initError: string | null;
    retryInit: () => Promise<NimiqProvider>;
}>();

const provider = computed(() => props.provider);
const hasProvider = computed(() => !!provider.value);

const addresses = ref<string[]>();
const account = ref<Account>();
const contractAddress = ref<string>();
const contract = ref<HTLContract | null>();
const blockNumber = ref(0);

let blockNumberInterval: number | undefined;

watch(() => props.provider, (nextProvider) => {
    if (blockNumberInterval !== undefined) {
        clearInterval(blockNumberInterval);
        blockNumberInterval = undefined;
    }

    if (!nextProvider) {
        blockNumber.value = 0;
        return;
    }

    const refreshBlockNumber = async () => {
        try {
            blockNumber.value = await nextProvider.getBlockNumber();
        } catch {}
    };

    refreshBlockNumber();
    blockNumberInterval = window.setInterval(refreshBlockNumber, 2e3);
}, { immediate: true });

onUnmounted(() => {
    if (blockNumberInterval !== undefined) {
        clearInterval(blockNumberInterval);
    }
});

async function retryProviderInit() {
    await props.retryInit().catch(() => {});
}

async function login() {
    if (!provider.value) return;
    const accounts = await provider.value.listAccounts()
    if ('error' in accounts) {
        console.error('Error listing accounts:', accounts.error);
        return;
    }
    if (accounts.length === 2) {
        addresses.value = accounts
        fetchBalance();
        fetchContract();
    }
}

function logout() {
    addresses.value = undefined;
    account.value = undefined;
    contractAddress.value = undefined;
    contract.value = undefined;
    earlySigProof.value = undefined;
    validityStartHeight.value = undefined;
}

async function fetchBalance() {
    if (!provider.value || !addresses.value) return;
    account.value = await provider.value.request({ method: 'getAccountByAddress', params: [addresses.value[1]!] });
    console.log('Fetched account info:', account.value);
}

async function fetchContract() {
    if (!provider.value) return;
    if (!contractAddress.value) {
        contract.value = null;
        return;
    }
    try {
        contract.value = await provider.value.request({ method: 'getAccountByAddress', params: [contractAddress.value] });
    } catch (e) {
        console.error('Error fetching contract info:', e);
        contract.value = null;
    }
}

function refresh() {
    fetchBalance();
    fetchContract();
}

const now = ref(Date.now());
setInterval(() => {
    now.value = Date.now();
}, 1e3)

const canCreateHtlc = computed(() => {
    return !contractAddress.value && !contract.value;
})

const canRedeemRegular = computed(() => {
    return !!contract.value && contract.value.timeout > (now.value + 5e3); // Prevent regular redeeming 5 seconds before the timeout expires
})

const canRedeemTimeout = computed(() => {
    return !!contract.value && contract.value.timeout < now.value;
})

const canRedeemEarly = computed(() => {
    return !!canRedeemRegular.value && !!earlySigProof.value;
})

const ZERO_PUBKEY_ADDRESS = 'NQ73 H7MG SSLA D4ES UB6H BT83 D69H RQ59 97NA'
const PRE_IMAGE = '343e07b93a2308d1d8bff4fc97992d2e3bf28af3378232d47781d2b4514ab741'
const HASH_ALGORITHM = 'sha256'
const HASH_COUNT = 1
const HASH_ROOT = '95f8f342c129d514b4dfcfff2cec406a3770697224d5a6a803a2783c71926079'

async function createHtlcForRegularRedeem() {
    if (!provider.value || !addresses.value) return;
    const valueStr = prompt(`Enter amount of NIM to lock (${account.value!.balance / 1e5} NIM available):`);
    if (!valueStr) return;
    const value = parseFloat(valueStr) * 1e5;
    try {
        const result = await provider.value.sendNewHtlcTransaction({
            htlcSender: ZERO_PUBKEY_ADDRESS,
            htlcRecipient: addresses.value[0]!,
            hashCount: HASH_COUNT,
            hashAlgorithm: HASH_ALGORITHM,
            hashRoot: HASH_ROOT,
            timeout: Date.now() + 24 * 60 * 60 * 1e3, // 24 hours
            value,
        });
        if (typeof result === 'object' && 'error' in result) {
            alert('Error creating HTLC: ' + result.error.message);
        } else {
            console.log('HTLC created successfully:', result);
            // TODO: Fetch transaction and display HTLC address?
            setTimeout(refresh, 1500);
        }
    } catch (e) {
        console.error('Exception while creating HTLC:', e);
    }
}

async function createHtlcForTimeoutRedeem() {
    if (!provider.value || !addresses.value) return;
    const valueStr = prompt(`Enter amount of NIM to lock (${account.value!.balance / 1e5} NIM available):`);
    if (!valueStr) return;
    const value = parseFloat(valueStr) * 1e5;
    try {
        const result = await provider.value.sendNewHtlcTransaction({
            htlcSender: addresses.value[0],
            htlcRecipient: ZERO_PUBKEY_ADDRESS,
            hashCount: HASH_COUNT,
            hashAlgorithm: HASH_ALGORITHM,
            hashRoot: '0000000000000000000000000000000000000000000000000000000000000000',
            timeout: Date.now() + 5e3, // 5 seconds
            value,
        });
        if (typeof result === 'object' && 'error' in result) {
            alert('Error creating HTLC: ' + result.error.message);
        } else {
            console.log('HTLC created successfully:', result);
            // TODO: Fetch transaction and display HTLC address?
            setTimeout(refresh, 1500);
        }
    } catch (e) {
        console.error('Exception while creating HTLC:', e);
    }
}

async function setHtlcAddress() {
    if (!!contractAddress.value || !!contract.value) return;
    const contractAddressStr = prompt("Enter HTLC address:");
    if (!contractAddressStr) return;
    contractAddress.value = contractAddressStr;
    await fetchContract();
}

async function redeemRegular() {
    if (!provider.value || !contract.value) return;
    try {
        const result = await provider.value.sendRedeemRegularHtlcTransaction({
            contractAddress: contract.value.address,
            preImage: PRE_IMAGE,
            hashCount: contract.value.hashCount,
            hashAlgorithm: contract.value.hashRoot.algorithm,
            hashRoot: contract.value.hashRoot.hash,
            value: contract.value.balance,
        });
        if (typeof result === 'object' && 'error' in result) {
            alert('Error redeeming HTLC (regular): ' + result.error.message);
        } else {
            console.log('HTLC redeemed successfully (regular):', result);
            setTimeout(refresh, 1500);
        }
    } catch (e) {
        console.error('Exception while redeeming HTLC (regular):', e);
    }
}

async function redeemTimeout() {
    if (!provider.value || !contract.value) return;
    try {
        const result = await provider.value.sendRedeemTimeoutHtlcTransaction({
            contractAddress: contract.value.address,
            value: contract.value.balance,
        });
        if (typeof result === 'object' && 'error' in result) {
            alert('Error redeeming HTLC (timeout): ' + result.error.message);
        } else {
            console.log('HTLC redeemed successfully (timeout):', result);
            setTimeout(refresh, 1500);
        }
    } catch (e) {
        console.error('Exception while redeeming HTLC (timeout):', e);
    }
}

const validityStartHeight = ref<number>()
const earlySigProof = ref<string>();
async function createEarlySignature() {
    if (!provider.value || !contract.value) return;
    try {
        validityStartHeight.value = blockNumber.value
        const result = await provider.value.signRedeemEarlyHtlcTransaction({
            contractAddress: contract.value.address,
            value: contract.value.balance,
            validityStartHeight: validityStartHeight.value,
        });
        if (typeof result === 'object' && 'error' in result) {
            alert('Error signing early redeem: ' + result.error.message);
        } else {
            console.log('Early redeem signed successfully:', result);
            earlySigProof.value = result
        }
    } catch (e) {
        console.error('Exception while signing early redeem:', e);
    }
}

async function redeemEarly() {
    if (!provider.value || !contract.value || !earlySigProof.value || !validityStartHeight.value) return;
    try {
        const result = await provider.value.sendRedeemEarlyHtlcTransaction({
            contractAddress: contract.value.address,
            htlcSenderSignature: new Array(98).fill('00').join(''), // Zero sigProof
            htlcRecipientSignature: earlySigProof.value,
            value: contract.value.balance,
            validityStartHeight: validityStartHeight.value,
        });
        if (typeof result === 'object' && 'error' in result) {
            alert('Error redeeming HTLC (early): ' + result.error.message);
        } else {
            console.log('HTLC redeemed successfully (early):', result);
            setTimeout(refresh, 1500);
        }
    } catch (e) {
        console.error('Exception while redeeming HTLC (early):', e);
    }
}

</script>

<template>
    <div>
        <h2>HTLC Mini-App</h2>

        <div v-if="!addresses">
            <button v-if="hasProvider" @click="login" style="background-color: green;">Connect Wallet</button>
            <template v-else>
                <p v-if="initError" style="color: red;">{{ initError }}</p>
                <button v-if="initError" @click="retryProviderInit">
                    Retry Provider Init
                </button>
                <p v-else>Waiting for Nimiq Web3 provider...</p>
            </template>
        </div>
        <div v-else>
            <h3>Account Balance</h3>
            <p>{{ account ? account.balance / 1e5 + ' NIM' : 'Loading...' }}</p>

            <h3>Contract</h3>
            <p>
                Balance: {{ contract ? (contract.balance / 1e5 + ' NIM') : contract === undefined ? 'Loading...' : '-' }}<br/>
                Timeout: {{ contract ? Math.round((contract.timeout - now) / 1e3) + 's' : contract === undefined ? 'Loading...' : '-' }}
            </p>

            <h3>Actions</h3>
            <p style="display: flex; flex-direction: column; gap: 8px;">
                <button @click="refresh">Refresh balances</button>
                <button :disabled="!canCreateHtlc" @click="createHtlcForRegularRedeem">Create HTLC for regular redeem</button>
                <button :disabled="!canCreateHtlc" @click="createHtlcForTimeoutRedeem">Create HTLC for timeout redeem</button>
                <button :disabled="!canCreateHtlc" @click="setHtlcAddress">Set HTLC address</button>
                <button :disabled="!canRedeemRegular" @click="redeemRegular">Redeem regular</button>
                <button :disabled="!canRedeemTimeout" @click="redeemTimeout">Redeem timeout</button>
                <button :disabled="!canRedeemRegular" @click="createEarlySignature">Sign early redeem</button>
                <button :disabled="!canRedeemEarly" @click="redeemEarly">Redeem early</button>
                <button @click="logout" style="background-color: red;">Logout</button>
            </p>
        </div>
    </div>
</template>
