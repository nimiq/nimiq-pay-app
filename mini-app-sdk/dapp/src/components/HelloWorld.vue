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
  output.value = await provider.getSenderAddress()
}

async function getDepositAddress() {
  output.value = await provider.getDepositAddress()
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
</style>
