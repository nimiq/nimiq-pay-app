<script setup lang="ts">
import { ref } from 'vue'
import { NimiqProvider } from '../../../NimiqProviderImpl'

defineProps<{ msg: string }>()

const provider = new NimiqProvider()
const inMiniApp = provider.isInMiniApp()

async function isConsensusEstablished() {
  output.value = await provider.isConsensusEstablished()
}

async function getSenderAddress() {
  const addressResult = await provider.getSenderAddress()
  if (!addressResult.ok) {
    output.value = `Error getting sender address: ${addressResult.error.type} - ${addressResult.error.message}`
    return
  }
  output.value = addressResult.value
}

async function getDepositAddress() {
  const addressResult = await provider.getDepositAddress()
  if (!addressResult.ok) {
    output.value = `Error getting deposit address: ${addressResult.error.type} - ${addressResult.error.message}`
    return
  }
  output.value = addressResult.value
}

async function getAccount() {
  const addressResult = await provider.getSenderAddress()
  if (!addressResult.ok) {
    output.value = `Error getting sender address: ${addressResult.error.type} - ${addressResult.error.message}`
    return
  }
  const accountResult = await provider.getAccount(addressResult.value)
  if (!accountResult.ok) {
    output.value = `Error getting account: ${accountResult.error.type} - ${accountResult.error.message}`
    return
  }
  output.value = accountResult.value
}

async function makeTransaction() {
  const txResult = await provider.makeTransaction({
    direction: 'send',
    recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    value: 100e5,
    data: {
      type: 'raw',
      raw: provider.bytesToHex(new TextEncoder().encode('Hello from mini-app!')),
    },
  })
  if (!txResult.ok) {
    output.value = `Error making transaction: ${txResult.error.type} - ${txResult.error.message}`
    return
  }
  output.value = txResult.value
}

async function signTransaction() {
  const txResult = await provider.signTransaction({
    direction: 'send',
    recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    value: 100e5,
    data: {
      type: 'raw',
      raw: provider.bytesToHex(new TextEncoder().encode('Hello from mini-app!')),
    },
  })
  if (!txResult.ok) {
    output.value = `Error making transaction: ${txResult.error.type} - ${txResult.error.message}`
    return
  }
  output.value = txResult.value
}

const output = ref()
</script>

<template>
  <h1>{{ msg }}</h1>

  <p v-if="!inMiniApp" class="error">
    This mini-app is not running inside the Nimiq Pay app! Some features may not be available.
  </p>

  <div class="card">
    <strong>Test requests:</strong>
    <button type="button" @click="isConsensusEstablished" :disabled="!inMiniApp">isConsensusEstablished</button>
    <button type="button" @click="getSenderAddress" :disabled="!inMiniApp">getSenderAddress</button>
    <button type="button" @click="getDepositAddress" :disabled="!inMiniApp">getDepositAddress</button>
    <button type="button" @click="getAccount" :disabled="!inMiniApp">getAccount</button>
    <button type="button" @click="makeTransaction" :disabled="!inMiniApp">makeTransaction</button>
    <button type="button" @click="signTransaction" :disabled="!inMiniApp">signTransaction</button>
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
