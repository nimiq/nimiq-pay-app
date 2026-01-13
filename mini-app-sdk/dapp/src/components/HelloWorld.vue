<script setup lang="ts">
import { ref } from 'vue'
import type { NimiqProvider } from "@trustwallet/web3-provider-nimiq"

defineProps<{ msg: string }>()

declare global {
    interface Window {
        nimiq: NimiqProvider
    }
}

const isInMiniApp = ref(!!window.nimiq)
const providerCheck = setInterval(() => {
  if (!!window.nimiq) {
    isInMiniApp.value = true
    clearInterval(providerCheck)
  }
}, 500)

async function isConsensusEstablished() {
  output.value = await window.nimiq.request({ method: 'nim_isConsensusEstablished' })
}

async function getSenderAddress() {
  const addressResult = await window.nimiq.request({ method: 'nim_requestAccounts' })
  output.value = addressResult[1]
}

async function getDepositAddress() {
  const addressResult = await window.nimiq.request({ method: 'nim_requestAccounts' })
  output.value = addressResult[0]
}

// async function getAccount() {
//   const addressResult = await provider.getSenderAddress()
//   if (!addressResult.ok) {
//     output.value = `Error getting sender address: ${addressResult.error.type} - ${addressResult.error.message}`
//     return
//   }
//   const accountResult = await provider.getAccount(addressResult.value)
//   if (!accountResult.ok) {
//     output.value = `Error getting account: ${accountResult.error.type} - ${accountResult.error.message}`
//     return
//   }
//   output.value = accountResult.value
// }

// async function sendPayment() {
//   const txResult = await provider.sendPayment({
//     recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
//     value: 100e5,
//     message: 'Hello from mini-app!',
//     merchant: {
//       name: 'Nimiq Mini-App Donation',
//     },
//   })
//   if (!txResult.ok) {
//     output.value = `Error making transaction: ${txResult.error.type} - ${txResult.error.message}`
//     return
//   }
//   output.value = txResult.value
// }

const output = ref()
</script>

<template>
  <h1>{{ msg }}</h1>

  <p v-if="!isInMiniApp" class="error">
    This mini-app is not running inside the Nimiq Pay app! Some features may not be available.
  </p>

  <div class="card">
    <strong>Test requests:</strong>
    <button type="button" @click="isConsensusEstablished" :disabled="!isInMiniApp">isConsensusEstablished</button>
    <button type="button" @click="getSenderAddress" :disabled="!isInMiniApp">getSenderAddress</button>
    <button type="button" @click="getDepositAddress" :disabled="!isInMiniApp">getDepositAddress</button>
    <!-- <button type="button" @click="getAccount" :disabled="!isInMiniApp">getAccount</button> -->
    <!-- <button type="button" @click="sendPayment" :disabled="!isInMiniApp">sendPayment</button> -->
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
