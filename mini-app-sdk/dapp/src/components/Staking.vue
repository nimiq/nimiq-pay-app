<script setup lang="ts">
import type { NimiqProvider } from '@nimiq/mini-app-sdk'
import { computed, onUnmounted, ref, watch } from 'vue';

interface Account {
    address: string;
    balance: number;
    type: 'basic' | 'vesting' | 'htlc' | 'staking';
}

interface Staker {
    address: string;
    balance: number;
    delegation: string | null;
    inactiveBalance: number;
    inactiveFrom: number | null;
    retiredBalance: number;
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
const staker = ref<Staker | null>();
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
    try {
        const accounts = await provider.value.listAccounts()
        if (accounts.length === 2) {
            addresses.value = accounts
            fetchBalance();
            fetchStaker();
        }
    } catch (e) {
        alert('Error listing accounts: ' + errorMessage(e));
        console.error('Error listing accounts:', e);
    }
}

function logout() {
    addresses.value = undefined;
    account.value = undefined;
    staker.value = undefined;
}

async function fetchBalance() {
    if (!provider.value || !addresses.value) return;
    account.value = await provider.value.request({ method: 'getAccountByAddress', params: [addresses.value[1]!] });
    console.log('Fetched account info:', account.value);
}

async function fetchStaker() {
    if (!provider.value || !addresses.value) return;
    try {
        staker.value = await provider.value.request({ method: 'getStakerByAddress', params: [addresses.value[0]!] });
    } catch (e) {
        console.error('Error fetching staker info:', e);
        staker.value = null;
    }
}

function refresh() {
    fetchBalance();
    fetchStaker();
}

const UNLOCKING_PERIOD = 60 * 60 * 12; // Unlocking period is one epoch (12 hours)
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isUnlocked(inactiveFrom: number): boolean {
    return blockNumber.value >= inactiveFrom + UNLOCKING_PERIOD;
}

const canStartStaking = computed(() => {
    return staker.value === null;
})

const canAddStake = computed(() => {
    return !!staker.value;
})

const canSetActiveStake = computed(() => {
    return !!staker.value?.balance || !!staker.value?.inactiveBalance;
})

const canRetireStake = computed(() => {
    return !!staker.value?.inactiveBalance && isUnlocked(staker.value.inactiveFrom!);
})

const canRemoveStake = computed(() => {
    return !!staker.value?.retiredBalance;
})

const canUpdateStaker = computed(() => {
    return !staker.value?.balance && !!staker.value?.inactiveBalance && isUnlocked(staker.value.inactiveFrom!);
})

async function startStaking() {
    if (!provider.value || !addresses.value) return;
    const delegationStr = prompt('Enter validator address to stake with:');
    if (!delegationStr) return;
    const valueStr = prompt(`Enter amount of NIM to stake (${account.value!.balance / 1e5} NIM available):`);
    if (!valueStr) return;
    const value = parseFloat(valueStr) * 1e5;
    try {
        const result = await provider.value.sendNewStakerTransaction({
            delegation: delegationStr,
            value, // TODO
        });
        console.log('Staking started successfully:', result);
        setTimeout(refresh, 1500);
    } catch (e) {
        alert('Error starting staking: ' + errorMessage(e));
        console.error('Exception while starting staking:', e);
    }
}

async function addStake() {
    if (!provider.value || !addresses.value) return;
    const valueStr = prompt(`Enter amount of NIM to add to stake (${account.value!.balance / 1e5} NIM available):`);
    if (!valueStr) return;
    const value = parseFloat(valueStr) * 1e5;
    try {
        const result = await provider.value.sendStakeTransaction({
            value,
        });
        console.log('Stake added successfully:', result);
        setTimeout(refresh, 1500);
    } catch (e) {
        alert('Error adding stake: ' + errorMessage(e));
        console.error('Exception while adding stake:', e);
    }
}

async function setActiveStake() {
    if (!provider.value || !addresses.value) return;
    const newActiveStr = prompt(`Enter new active stake amount (current: ${staker!.value!.balance / 1e5} NIM, inactive: ${staker!.value!.inactiveBalance / 1e5} NIM):`);
    if (!newActiveStr) return;
    const newActiveBalance = parseFloat(newActiveStr) * 1e5;
    try {
        const result = await provider.value.sendSetActiveStakeTransaction({
            newActiveBalance,
        });
        console.log('Active stake set successfully:', result);
        setTimeout(refresh, 1500);
    } catch (e) {
        alert('Error setting active stake: ' + errorMessage(e));
        console.error('Exception while setting active stake:', e);
    }
}

async function retireStake() {
    if (!provider.value || !addresses.value) return;
    const retireStakeStr = prompt(`Enter amount of NIM to retire (inactive: ${staker!.value!.inactiveBalance / 1e5} NIM):`);
    if (!retireStakeStr) return;
    const retireStake = parseFloat(retireStakeStr) * 1e5;
    try {
        const result = await provider.value.sendRetireStakeTransaction({
            retireStake,
        });
        console.log('Stake retired successfully:', result);
        setTimeout(refresh, 1500);
    } catch (e) {
        alert('Error retiring stake: ' + errorMessage(e));
        console.error('Exception while retiring stake:', e);
    }
}

async function removeStake() {
    if (!provider.value || !addresses.value) return;
    const removeStakeStr = prompt(`Enter amount of NIM to remove (retired: ${staker!.value!.retiredBalance / 1e5} NIM):`);
    if (!removeStakeStr) return;
    const removeStake = parseFloat(removeStakeStr) * 1e5;
    try {
        const result = await provider.value.sendRemoveStakeTransaction({
            value: removeStake,
        });
        console.log('Stake removed successfully:', result);
        setTimeout(refresh, 1500);
    } catch (e) {
        alert('Error removing stake: ' + errorMessage(e));
        console.error('Exception while removing stake:', e);
    }
}

async function updateStaker() {
    if (!provider.value || !addresses.value) return;
    const newDelegationStr = prompt('Enter new validator address to stake with:');
    if (!newDelegationStr) return;
    try {
        const result = await provider.value.sendUpdateStakerTransaction({
            newDelegation: newDelegationStr,
            reactivateAllStake: true,
        });
        console.log('Staker updated successfully:', result);
        setTimeout(refresh, 1500);
    } catch (e) {
        alert('Error updating staker: ' + errorMessage(e));
        console.error('Exception while updating staker:', e);
    }
}

function timeToUnlock(inactiveFrom: number | null, currentBlockNumber: number): string {
    if (!inactiveFrom) return 'N/A';
    const blocksLeft = (inactiveFrom + UNLOCKING_PERIOD) - currentBlockNumber;
    if (blocksLeft <= 0) return 'Already unlocked';
    const secondsLeft = blocksLeft * 59.1/60; // ~1 block per second
    const hours = Math.floor(secondsLeft / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);
    const seconds = Math.floor(secondsLeft) % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
}

</script>

<template>
    <div>
        <h2>Staking Mini-App</h2>

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

            <h3>Staked Balance</h3>
            <p>
                Active: {{ staker ? (staker.balance / 1e5 + ' NIM') : staker === undefined ? 'Loading...' : '0 NIM' }}<br/>
                Inactive: {{ staker ? (staker.inactiveBalance / 1e5 + ' NIM') : staker === undefined ? 'Loading...' : '0 NIM' }}<br/>
                <span v-if="staker?.inactiveBalance" style="color: orange;">
                    Unlocked in: {{ timeToUnlock(staker.inactiveFrom, blockNumber) }}<br/>
                </span>
                Retired: {{ staker ? (staker.retiredBalance / 1e5 + ' NIM') : staker === undefined ? 'Loading...' : '0 NIM' }}<br/>
            </p>

            <h3>Actions</h3>
            <p style="display: flex; flex-direction: column; gap: 8px;">
                <button @click="refresh">Refresh balances</button>
                <button :disabled="!canStartStaking" @click="startStaking">Start Staking</button>
                <button :disabled="!canAddStake" @click="addStake">Add Stake</button>
                <button :disabled="!canSetActiveStake" @click="setActiveStake">(De)activate Stake</button>
                <button :disabled="!canRetireStake" @click="retireStake">Retire Stake</button>
                <button :disabled="!canRemoveStake" @click="removeStake">Unstake</button>
                <button :disabled="!canUpdateStaker" @click="updateStaker">Change validator</button>
                <button @click="logout" style="background-color: red;">Logout</button>
            </p>
        </div>
    </div>
</template>
