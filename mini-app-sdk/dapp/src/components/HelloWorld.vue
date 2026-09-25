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
const balanceAddress = ref('')
const isFetchingBalance = ref(false)
const lightningInvoice = ref('')
const isPayingLightning = ref(false)

async function isConsensusEstablished() {
  output.value = await provider.value.isConsensusEstablished()
}

async function getBlockNumber() {
  output.value = await provider.value.getBlockNumber()
}

async function getBalance() {
  const nimiq = props.provider
  if (!nimiq || !('getBalance' in nimiq) || typeof nimiq.getBalance !== 'function') {
    output.value = 'getBalance is unavailable. Update Nimiq Pay to use this method.'
    return
  }

  const address = balanceAddress.value.trim()
  if (!address || isFetchingBalance.value)
    return

  isFetchingBalance.value = true
  output.value = 'Fetching balance...'
  try {
    const balance: unknown = await nimiq.getBalance(address)
    output.value = typeof balance === 'number'
      ? { address, balanceLuna: balance, balanceNim: balance / 1e5 }
      : balance
  }
  catch (error) {
    output.value = error && typeof error === 'object' && 'message' in error
      ? error.message
      : String(error)
  }
  finally {
    isFetchingBalance.value = false
  }
}

async function listAccounts() {
  output.value = await provider.value.listAccounts()
}

async function sign() {
  output.value = await provider.value.sign('Hello Mini-App!')
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

async function payLightningInvoice() {
  const nimiq = props.provider
  if (!nimiq || !('payLightningInvoice' in nimiq) || typeof nimiq.payLightningInvoice !== 'function') {
    output.value = 'payLightningInvoice is unavailable. Update Nimiq Pay to test this flow.'
    return
  }
  const invoice = lightningInvoice.value.trim()
  if (!invoice || isPayingLightning.value)
    return

  isPayingLightning.value = true
  output.value = 'Choose NIM or USDT in Nimiq Pay...'
  try {
    output.value = await nimiq.payLightningInvoice({ invoice })
  }
  catch (error) {
    output.value = error && typeof error === 'object'
      ? {
          type: 'type' in error ? error.type : 'UNKNOWN_ERROR',
          message: 'message' in error ? error.message : String(error),
          data: 'data' in error ? error.data : undefined,
        }
      : String(error)
  }
  finally {
    isPayingLightning.value = false
  }
}

async function requestDeviceIdentifier() {
  if (!window.nimiqPay?.requestDeviceIdentifier) {
    output.value = 'nimiqPay.requestDeviceIdentifier is unavailable in this context'
    return
  }
  try {
    output.value = await window.nimiqPay.requestDeviceIdentifier({ reason: 'Leaderboard ranking' })
  }
  catch (err) {
    output.value = (err as Error).message
  }
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
    <form class="balance-query" @submit.prevent="getBalance">
      <label for="balance-address">Nimiq address</label>
      <input id="balance-address" v-model="balanceAddress" placeholder="NQ..." :disabled="isFetchingBalance">
      <button type="submit" :disabled="!hasProvider || !balanceAddress.trim() || isFetchingBalance">
        {{ isFetchingBalance ? 'Fetching balance...' : 'getBalance' }}
      </button>
      <small>On-chain balance on Nimiq Pay's active network. 100,000 luna = 1 NIM.</small>
    </form>
    <button type="button" @click="listAccounts" :disabled="!hasProvider">listAccounts</button>
    <button type="button" @click="sign" :disabled="!hasProvider">sign</button>
    <button type="button" @click="sendBasicTransaction" :disabled="!hasProvider">sendBasicTransaction</button>
    <button type="button" @click="sendBasicTransactionWithData" :disabled="!hasProvider">sendBasicTransactionWithData</button>
    <form class="balance-query" @submit.prevent="payLightningInvoice">
      <label for="lightning-invoice">BTC Lightning invoice or fixed LNURL</label>
      <textarea id="lightning-invoice" v-model="lightningInvoice" rows="3" placeholder="lnbc... or lnurl..." :disabled="isPayingLightning" />
      <button type="submit" :disabled="!hasProvider || !lightningInvoice.trim() || isPayingLightning">
        {{ isPayingLightning ? 'Paying...' : 'payLightningInvoice' }}
      </button>
      <small>Choose NIM or USDT in Nimiq Pay. A returned hash means the payment was submitted; Lightning settlement continues in Nimiq Pay.</small>
    </form>
    <button type="button" @click="requestDeviceIdentifier">Request Device Identifier</button>
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
.balance-query {
  display: grid;
  gap: 8px;
  width: 100%;
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
