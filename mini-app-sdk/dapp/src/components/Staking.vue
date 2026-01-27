<script setup lang="ts">
import { ref } from 'vue';
import { getAccountByAddress, getStakerByAddress, type Account, type Staker } from '../lib/rpc';

const addresses = ref<string[]>();
const account = ref<Account>();
const staker = ref<Staker | null>();

const hasProvider = ref(!!window.nimiq)
if (!hasProvider.value) {
  const providerCheck = setInterval(() => {
      hasProvider.value = !!window.nimiq
      if (hasProvider.value) {
          clearInterval(providerCheck)
      }
  }, 100)
}

async function login() {
    let accounts = await window.nimiq.listAccounts()
    if ('error' in accounts) {
        console.error('Error listing accounts:', accounts.error);
        return;
    }
    if (accounts.length === 2) {
        addresses.value = accounts
        fetchBalance();
        fetchStaker();
    }
}

function logout() {
    addresses.value = undefined;
    account.value = undefined;
    staker.value = undefined;
}

async function fetchBalance() {
    if (!addresses.value) return;
    account.value = await getAccountByAddress(addresses.value[1]!);
}

async function fetchStaker() {
    if (!addresses.value) return;
    try {
        staker.value = await getStakerByAddress(addresses.value[0]!);
    } catch (e) {
        console.error('Error fetching staker info:', e);
        staker.value = null;
    }
}

function refresh() {
    fetchBalance();
    fetchStaker();
}

async function startStaking() {
    if (!addresses.value) return;
    const delegationStr = prompt('Enter validator address to stake with:');
    if (!delegationStr) return;
    const valueStr = prompt(`Enter amount of NIM to stake (${account.value!.balance / 1e5} NIM available):`);
    if (!valueStr) return;
    const value = parseFloat(valueStr) * 1e5;
    try {
        const result = await window.nimiq.sendNewStakerTransaction({
            delegation: delegationStr,
            value, // TODO
        });
        if (typeof result === 'object' && 'error' in result) {
            alert('Error starting staking: ' + result.error.message);
        } else {
            console.log('Staking started successfully:', result);
            fetchStaker();
            fetchBalance();
        }
    } catch (e) {
        console.error('Exception while starting staking:', e);
    }
}

</script>

<template>
    <div>
        <h2>Staking Mini-App</h2>

        <div v-if="!addresses">
            <button v-if="hasProvider" @click="login">Connect Wallet</button>
            <p v-else>Waiting for Nimiq Web3 provider...</p>
        </div>
        <div v-else>
            <h3>Unstaked Balance</h3>
            <p>{{ account ? account.balance / 1e5 + ' NIM' : 'Loading...' }}</p>

            <h3>Staked Balance</h3>
            <p>
                Active: {{ staker ? (staker.balance / 1e5 + ' NIM') : staker === undefined ? 'Loading...' : '0 NIM' }}<br/>
                Inactive: {{ staker ? (staker.inactiveBalance / 1e5 + ' NIM') : staker === undefined ? 'Loading...' : '0 NIM' }}<br/>
                Retired: {{ staker ? (staker.retiredBalance / 1e5 + ' NIM') : staker === undefined ? 'Loading...' : '0 NIM' }}<br/>
            </p>

            <h3>Actions</h3>
            <p style="display: flex; flex-direction: column; gap: 8px;">
                <button @click="refresh">Refresh balances</button>
                <button v-if="staker === null" @click="startStaking">Start Staking</button>
                <button @click="logout" style="background-color: red;">Logout</button>
            </p>
        </div>
    </div>
</template>
