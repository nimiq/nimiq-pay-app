<script setup lang="ts">
import { provide, ref, watch } from 'vue'
import RunReport from './RunReport.vue'
import ScenarioRunner from './ScenarioRunner.vue'
import { labKey, useLab } from './useLab'
import WalletSetup from './WalletSetup.vue'

const lab = useLab()
provide(labKey, lab)
const reviewDialog = ref<HTMLDialogElement>()
watch(lab.reviewRequest, (request) => {
  if (request)
    reviewDialog.value?.showModal()
  else
    reviewDialog.value?.close()
}, { flush: 'post' })
</script>

<template>
  <main>
    <header><div><h1>HTLC Lab<span>.</span></h1><p>Controlled chain scenarios. Real app recovery checks.</p></div><span class="network-badge" :class="{ mainnet: lab.state.network === 'mainnet' }">{{ lab.state.network }}</span></header>
    <div class="notice">
      Local operator tool · Keep the app closed during HTLC setup. Wallet recovery words are saved unencrypted in this browser’s local storage. Export reports before refreshing; run tracking is not saved.
    </div>
    <div v-if="lab.state.error" class="error" role="alert">
      {{ lab.state.error }}
    </div>
    <div v-if="lab.notification.value" class="notice" role="status">
      {{ lab.notification.value }}
      <button class="secondary" @click="lab.notification.value = ''">
        Dismiss
      </button>
    </div>
    <p v-if="lab.working.value" class="working" role="status">
      Working… {{ lab.state.message }}
    </p>
    <WalletSetup />
    <ScenarioRunner />
    <RunReport />
    <dialog ref="reviewDialog" aria-labelledby="review-title" @cancel.prevent="lab.resolveReview(false)">
      <h2 id="review-title">
        {{ lab.reviewRequest.value?.broadcast ? 'Review transactions' : 'Clear run' }}
      </h2>
      <p><strong>{{ lab.state.network.toUpperCase() }}</strong> {{ lab.state.network === 'mainnet' && lab.reviewRequest.value?.broadcast ? '— this spends real NIM.' : '' }}</p>
      <p>{{ lab.reviewRequest.value?.description }}</p>
      <p class="field-label">
        App wallet
      </p><code class="address">{{ lab.state.owner }}</code>
      <template v-if="lab.state.spammer">
        <p class="field-label">
          Spam wallet
        </p><code class="address">{{ lab.state.spammer }}</code>
      </template>
      <div class="actions">
        <button class="secondary" autofocus @click="lab.resolveReview(false)">
          Cancel
        </button><button @click="lab.resolveReview(true)">
          {{ lab.reviewRequest.value?.broadcast ? 'Broadcast' : 'Clear run' }}
        </button>
      </div>
    </dialog>
    <footer>Chain evidence is automatic. App verdicts are manual. Amounts in NIM. Fees in Luna.</footer>
  </main>
</template>
