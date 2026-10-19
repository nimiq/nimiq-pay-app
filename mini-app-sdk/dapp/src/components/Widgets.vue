<script setup lang="ts">
import type { NimiqProvider } from '@nimiq/mini-app-sdk'
import { onMounted, ref } from 'vue'

const props = defineProps<{ provider: NimiqProvider | null }>()

const onHome = ref<string[]>([])
const status = ref('')

const widgets = () => window.nimiqPay?.widgets

async function refreshList() {
  onHome.value = (await widgets()?.list()) ?? []
}

async function run(label: string, action: () => Promise<unknown>) {
  try {
    const result = await action()
    status.value = `${label}: ${JSON.stringify(result ?? 'ok')}`
    await refreshList()
  }
  catch (error) {
    status.value = `${label} failed: ${(error as Error).message}`
  }
}

async function address(): Promise<string> {
  const accounts = await props.provider!.listAccounts()
  if (!Array.isArray(accounts) || !accounts[0])
    throw new Error('No Nimiq account')
  return accounts[0]
}

function pushScheduled() {
  const until = Date.now() + 2 * 60_000
  return widgets()!.update('lab', {
    content: {
      label: 'Scheduled',
      value: { amount: '0.05', currency: 'ETH' },
      info: 'turns green in 2 minutes',
      tone: 'attention',
      progress: 0.4,
      countdown: { label: 'Time left', until },
      rows: [{ label: 'Step', value: { text: '2 of 5' } }, { label: 'Fiat', value: { amount: '12.40', currency: 'EUR' } }],
    },
    next: [{ on: { at: until }, state: { content: { label: 'Scheduled', value: { text: 'Time is up' }, tone: 'positive' }, expiresAt: until + 10 * 60_000 } }],
  })
}

function pushChart() {
  return widgets()!.update('lab', {
    content: {
      label: 'Chart',
      value: { text: '12 bars' },
      chart: { kind: 'bars', points: Array.from({ length: 12 }, (_, i) => Math.round(50 + 40 * Math.sin(i))) },
    },
  })
}

async function pushChainTrigger() {
  const own = await address()
  // A tiny payment to yourself, so there is a real hash to watch.
  const hash = await props.provider!.sendBasicTransaction({ recipient: own, value: 1 })
  if (typeof hash !== 'string')
    throw new Error(hash.error.message)
  return widgets()!.update('lab', {
    content: { label: 'Chain trigger', value: { text: 'Waiting for confirmation' }, tone: 'attention' },
    // Give a state with lookup triggers an expiry, so it can never stay on Home forever.
    expiresAt: Date.now() + 30 * 60_000,
    next: [
      { on: { nimiqTx: hash, status: 'confirmed' }, state: { content: { label: 'Chain trigger', value: { text: 'Confirmed' }, tone: 'positive' }, expiresAt: Date.now() + 10 * 60_000 } },
      { on: { nimiqTx: hash, status: 'failed' }, state: { content: { label: 'Chain trigger', value: { text: 'Failed' }, tone: 'negative' }, expiresAt: Date.now() + 10 * 60_000 } },
    ],
  })
}

onMounted(async () => {
  try {
    await refreshList()
  }
  catch (error) {
    status.value = `list failed: ${(error as Error).message}`
  }
})
</script>

<template>
  <section style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
    <p v-if="!widgets()" role="alert">
      window.nimiqPay.widgets is unavailable: open this demo inside a Nimiq Pay build with widgets.
    </p>
    <p data-testid="widgets-on-home">
      On Home: {{ onHome.join(', ') || 'none' }}
    </p>
    <button type="button" @click="run('add nim-price', () => widgets()!.add('nim-price'))">Add NIM price (no code)</button>
    <button type="button" @click="run('add lab', () => widgets()!.add('lab'))">Add widget lab</button>
    <button type="button" @click="run('lab scheduled', pushScheduled)">Lab: scheduled state</button>
    <button type="button" @click="run('lab chart', pushChart)">Lab: bar chart</button>
    <button type="button" :disabled="!provider" @click="run('lab chain trigger', pushChainTrigger)">Lab: chain trigger (sends 0.00001 NIM to yourself)</button>
    <button type="button" @click="run('lab reset', () => widgets()!.update('lab', null))">Lab: back to resting</button>
    <button type="button" @click="run('remove lab', () => widgets()!.remove('lab'))">Remove widget lab</button>
    <button type="button" @click="run('lab invalid', () => widgets()!.update('lab', { content: { value: { text: 'x' } }, refresh: { url: 'https://example.com/', every: 60 } }))">Lab: send an invalid state</button>
    <p data-testid="widgets-status" style="opacity: 0.7;">
      {{ status }}
    </p>
  </section>
</template>
