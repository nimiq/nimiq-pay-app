<script setup lang="ts">
import type { NimiqProvider } from '@nimiq/mini-app-sdk'
import { computed, ref } from 'vue'

const props = defineProps<{
  provider: NimiqProvider | null
  isInitializing: boolean
  initError: string | null
  retryInit: () => Promise<NimiqProvider>
}>()

const hasProvider = computed(() => props.provider !== null)
const provider = computed(() => props.provider as NimiqProvider)
const output = ref<unknown | null>(null)

async function isConsensusEstablished() {
  output.value = await provider.value.isConsensusEstablished()
}

async function getBlockNumber() {
  output.value = await provider.value.getBlockNumber()
}

async function listAccounts() {
  output.value = await provider.value.listAccounts()
}

async function sign() {
  output.value = await provider.value.sign("Hello Mini-App!")
}

async function sendBasicTransaction() {
  output.value = await provider.value.sendBasicTransaction({
    recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    value: 100e5,
    // merchant: {
    //   name: 'Nimiq Mini-App Donation',
    // },
  })
}

async function sendBasicTransactionWithData() {
  output.value = await provider.value.sendBasicTransactionWithData({
    recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    value: 100e5,
    data: 'Hello from mini-app!',
    // merchant: {
    //   name: 'Nimiq Mini-App Donation',
    // },
  })
}

async function retryProviderInit() {
  await props.retryInit().catch(() => {})
}
</script>

<template>
  <h2>Kitchen Sink</h2>

  <p v-if="initError" class="error">
    {{ initError }}
  </p>
  <p v-else-if="isInitializing">
    Waiting for the Nimiq mini-app provider...
  </p>
  <p v-else-if="!hasProvider">
    Nimiq mini-app provider unavailable.
  </p>

  <button
    v-if="initError"
    @click="retryProviderInit"
  >
    Retry Provider Init
  </button>

  <div class="card">
    <strong>Test requests:</strong>
    <button type="button" @click="isConsensusEstablished" :disabled="!hasProvider">isConsensusEstablished</button>
    <button type="button" @click="getBlockNumber" :disabled="!hasProvider">getBlockNumber</button>
    <button type="button" @click="listAccounts" :disabled="!hasProvider">listAccounts</button>
    <button type="button" @click="sign" :disabled="!hasProvider">sign</button>
    <button type="button" @click="sendBasicTransaction" :disabled="!hasProvider">sendBasicTransaction</button>
    <button type="button" @click="sendBasicTransactionWithData" :disabled="!hasProvider">sendBasicTransactionWithData</button>
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
  gap: 8px;
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
