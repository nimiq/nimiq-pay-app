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
    <button type="button" @click="getBlockNumber" :disabled="!isInMiniApp">getBlockNumber</button>
    <button type="button" @click="listAccounts" :disabled="!isInMiniApp">listAccounts</button>
    <button type="button" @click="sign" :disabled="!isInMiniApp">sign</button>
    <button type="button" @click="sendBasicTransaction" :disabled="!isInMiniApp">sendBasicTransaction</button>
    <button type="button" @click="sendBasicTransactionWithData" :disabled="!isInMiniApp">sendBasicTransactionWithData</button>
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
