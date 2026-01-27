<script setup lang="ts">
import { ref } from 'vue'
import type { NimiqProvider } from "@trustwallet/web3-provider-nimiq"

declare global {
    interface Window {
        nimiq: NimiqProvider
    }
}

const hasProvider = ref(!!window.nimiq)
if (!hasProvider.value) {
  const providerCheck = setInterval(() => {
      hasProvider.value = !!window.nimiq
      if (hasProvider.value) {
          clearInterval(providerCheck)
      }
  }, 100)
}

async function isConsensusEstablished() {
  output.value = await window.nimiq.isConsensusEstablished()
}

async function getBlockNumber() {
  output.value = await window.nimiq.getBlockNumber()
}

async function listAccounts() {
  output.value = await window.nimiq.listAccounts()
}

async function sign() {
  output.value = await window.nimiq.sign("Hello Mini-App!")
}

async function sendBasicTransaction() {
  output.value = await window.nimiq.sendBasicTransaction({
    recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    value: 100e5,
    // merchant: {
    //   name: 'Nimiq Mini-App Donation',
    // },
  })
}

async function sendBasicTransactionWithData() {
  output.value = await window.nimiq.sendBasicTransactionWithData({
    recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    value: 100e5,
    data: 'Hello from mini-app!',
    // merchant: {
    //   name: 'Nimiq Mini-App Donation',
    // },
  })
}

async function sendNewStakerTransaction() {
  output.value = await window.nimiq.sendNewStakerTransaction({
    delegation: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    value: 100e5,
  })
}

const output = ref()
</script>

<template>
  <h2>Kitchen Sink</h2>

  <p v-if="!hasProvider" class="error">
    Nimiq Web3 Provider not detected! Some features may not be available.
  </p>

  <div class="card">
    <strong>Test requests:</strong>
    <button type="button" @click="isConsensusEstablished" :disabled="!hasProvider">isConsensusEstablished</button>
    <button type="button" @click="getBlockNumber" :disabled="!hasProvider">getBlockNumber</button>
    <button type="button" @click="listAccounts" :disabled="!hasProvider">listAccounts</button>
    <button type="button" @click="sign" :disabled="!hasProvider">sign</button>
    <button type="button" @click="sendBasicTransaction" :disabled="!hasProvider">sendBasicTransaction</button>
    <button type="button" @click="sendBasicTransactionWithData" :disabled="!hasProvider">sendBasicTransactionWithData</button>
    <button type="button" @click="sendNewStakerTransaction" :disabled="!hasProvider">sendNewStakerTransaction</button>
    <br/>
    <strong>Response:</strong>
    <pre>
{{ output }}
    </pre>
  </div>
</template>

<style scoped>
.error {
  color: red;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1em;
}
pre {
  margin: 0;
  text-align: left;
  width: 100%;
  padding: 1em;
  border-radius: 0.5em;
  background: #eee;
}

@media (prefers-color-scheme: dark) {
  pre {
    background: #333;
    color: #eee;
  }
}
</style>
