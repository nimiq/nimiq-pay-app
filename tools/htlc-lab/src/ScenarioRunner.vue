<script setup lang="ts">
import { computed, inject } from 'vue'
import { formatNim, parseLuna, parseNim } from './protocol'
import { labKey } from './useLab'

const lab = inject(labKey)!
const spam = computed(() => lab.state.transactions.filter(t => t.kind === 'spam'))
const confirmed = computed(() => spam.value.filter(t => t.state === 'confirmed').length)
const locked = computed(() => lab.working.value || lab.state.busy)
const budget = computed(() => {
  try {
    const amount = parseNim(lab.form.amount)
    const fee = parseLuna(lab.form.fee)
    const count = Number(lab.form.count)
    const owner = ['two', 'bomb'].includes(lab.form.scenario)
      ? 2 * (amount + fee)
      : lab.form.scenario === 'drained' ? amount + 3 * fee : amount + fee
    const spammer = lab.form.scenario === 'bomb' ? count * (1 + fee) : 0
    if (amount <= fee || !Number.isSafeInteger(owner) || !Number.isSafeInteger(spammer)
      || (lab.form.scenario === 'bomb' && (!Number.isInteger(count) || count < 1 || count > 1000))) {
      return null
    }
    return { owner, spammer }
  }
  catch { return null }
})
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <span class="step-number">02</span><h2>Build the scenario</h2>
    </div>
    <div class="scenario-tabs" role="group" aria-label="Scenario">
      <button v-for="scenario in lab.scenarios" :key="scenario.id" class="scenario-tab" :class="{ selected: lab.form.scenario === scenario.id }" :aria-pressed="lab.form.scenario === scenario.id" :disabled="lab.state.stage !== 'idle' || locked" :aria-describedby="(lab.state.stage !== 'idle' || locked) ? 'scenariorunner-disabled-0' : undefined" @click="lab.form.scenario = scenario.id">
        {{ scenario.title }}
      </button>
    </div>
    <p v-if="lab.state.stage !== 'idle' || locked" id="scenariorunner-disabled-0" class="hint disabled-reason">
      {{ lab.busyReason.value || 'Finish and clear this run before changing scenarios.' }}
    </p>
    <h3>{{ lab.selected.value.title }}</h3>
    <p class="hint">
      Before each HTLC scenario, the tool scans wallet and extension history for funded existing HTLCs. Claim each one first, then confirm it is empty before starting the test. Keep Nimiq Pay closed. If the cosigner cannot claim yet, wait for its spending window or the contract expiry and retry.
    </p>
    <div v-if="lab.state.existingContracts.length" class="table-scroll" role="region" aria-label="Existing HTLCs to claim" tabindex="0">
      <table>
        <thead><tr><th>Existing HTLC</th><th>Balance · NIM</th><th>Expiry</th></tr></thead><tbody>
          <tr v-for="contract in lab.state.existingContracts" :key="contract.address">
            <td><code>{{ contract.address }}</code></td><td>{{ formatNim(contract.balance) }}</td><td>{{ new Date(contract.expiry).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>{{ lab.selected.value.description }}</p>
    <div v-if="lab.form.scenario === 'bomb'" class="instruction">
      <strong>Required order</strong>
      <p>Fund A → wait for expiry → send spam → confirm every transfer → fund B → open the app. Keep A funded throughout setup. Default 250 receipts pushes its creation beyond the first 100-entry page.</p>
    </div>
    <fieldset :disabled="lab.state.stage !== 'idle' || locked" class="config-grid">
      <div><label for="amount">Amount per HTLC · NIM</label><input id="amount" v-model="lab.form.amount" inputmode="decimal"><small>Default 0.01 NIM. Up to 5 decimal places.</small></div>
      <div><label for="fee">Fee per transaction · Luna</label><input id="fee" v-model="lab.form.fee" inputmode="numeric"><small>Zero matches the app. Increase if transactions do not propagate; never replace an uncertain send.</small></div>
      <div v-if="lab.form.scenario === 'expired' || lab.form.scenario === 'bomb'">
        <label for="expiry">A expires after · minutes</label><input id="expiry" v-model="lab.form.expiryMinutes" type="number" min="1" max="1440"><small>Uses chain time to detect expiry. Longer-lived A/B use 14 days.</small>
      </div>
      <div v-if="lab.form.scenario === 'bomb'">
        <label for="count">0.00001 NIM transfers</label><input id="count" v-model="lab.form.count" type="number" min="1" max="1000"><small>1–1,000. Max 2/sec and 20 unresolved. Unique data keeps hashes distinct.</small>
      </div>
    </fieldset>
    <div v-if="lab.state.stage === 'idle'" class="funding-summary" aria-live="polite">
      <strong>Required funding</strong>
      <template v-if="budget">
        <p>
          App wallet: at least <b>{{ formatNim(budget.owner) }} NIM</b><template v-if="lab.form.scenario === 'bomb'">
            . Reserve HTLC B’s funds here throughout the spam batch
          </template>.
        </p>
        <p v-if="lab.form.scenario === 'bomb'">
          Spam wallet: at least <b>{{ formatNim(budget.spammer) }} NIM</b> for {{ lab.form.count }} transfers, including fees. Generate and fund it before starting the batch.
        </p>
        <small>Cleanup fees come from each HTLC’s balance. {{ lab.form.scenario === 'drained' ? 'Returned A funds are reused to fund B.' : '' }}</small>
      </template>
      <p v-else>
        Enter valid NIM amounts with up to 5 decimal places. Each HTLC must hold more than its cleanup fee; the spam count must be 1–1,000.
      </p>
    </div>
    <p v-if="lab.state.stage === 'idle' && lab.state.transactions.length" class="hint">
      Export and clear the deposit session above before starting an HTLC scenario.
    </p>
    <template v-if="lab.state.stage === 'idle'">
      <label class="check"><input v-model="lab.form.appClosed" type="checkbox"> Nimiq Pay is closed. It must not recover or move funds during setup.</label>
      <button :disabled="!lab.state.connected || !lab.form.appClosed || !budget || locked || lab.state.transactions.length > 0" :aria-describedby="(!lab.state.connected || !lab.form.appClosed || !budget || locked || lab.state.transactions.length > 0) ? 'scenariorunner-disabled-1' : undefined" @click="lab.perform(lab.start)">
        Review &amp; create HTLC A
      </button><p v-if="!lab.state.connected || !lab.form.appClosed || !budget || locked || lab.state.transactions.length > 0" id="scenariorunner-disabled-1" class="hint disabled-reason">
        {{ lab.busyReason.value || (!lab.state.connected ? 'Import the app wallet and connect first.' : !lab.form.appClosed ? 'Close Nimiq Pay and tick the confirmation above.' : !budget ? 'Correct the amount, fee, or transfer count above.' : 'Export and clear the deposit session first.') }}
      </p>
      <p v-if="!lab.state.connected" class="hint">
        Import the app wallet and connect above to enable scenario creation.
      </p>
    </template>
    <template v-else>
      <div class="run-status" aria-live="polite">
        <strong>{{ lab.state.paused && lab.state.stage === 'spamming' ? 'Spam paused' : lab.state.stage.replaceAll('-', ' ') }}</strong><p>{{ lab.state.message }}</p>
      </div>
      <div v-if="lab.state.config?.scenario === 'bomb'" class="spam-progress">
        <progress aria-label="Confirmed spam transfers" :value="confirmed" :max="lab.state.config.count" />
        <span>{{ confirmed }} / {{ lab.state.config.count }} confirmed · {{ spam.length }} submitted</span>
      </div>
      <div class="actions">
        <button v-if="lab.action.value" :disabled="locked" :aria-describedby="(locked) ? 'scenariorunner-disabled-2' : undefined" @click="lab.perform(lab.advance)">
          Review &amp; {{ lab.action.value.toLowerCase() }}
        </button><p v-if="(lab.action.value) && (locked)" id="scenariorunner-disabled-2" class="hint disabled-reason">
          {{ lab.busyReason.value }}
        </p>
        <button v-if="lab.state.stage === 'spamming'" class="secondary" @click="lab.state.paused = !lab.state.paused">
          {{ lab.state.paused ? 'Resume spam' : 'Pause spam' }}
        </button>
        <button v-if="!['observe', 'cancelled', 'failed'].includes(lab.state.stage)" class="secondary" @click="lab.cancel">
          Cancel scenario
        </button>
      </div>
      <p class="hint">
        Pause stops new spam; submitted hashes keep updating. Cancel ends this scenario and blocks B. Unknown means unresolved, not failed: keep the page open and inspect the hash before taking further action.
      </p>
    </template>
    <p v-if="lab.state.stage === 'waiting-expiry'" class="hint">
      Latest chain time: {{ new Date(lab.state.head.timestamp).toLocaleString() }}. A expires at {{ new Date(lab.state.contracts[0].expiry).toLocaleString() }}. Device time does not unlock recovery.
    </p>
    <div v-if="lab.state.contracts.length" class="table-scroll" role="region" aria-label="HTLC balances and expiry" tabindex="0">
      <table>
        <thead><tr><th>HTLC</th><th>Address</th><th>Live NIM</th><th>Expiry</th><th>Cosigner</th></tr></thead>
        <tbody>
          <tr v-for="contract in lab.state.contracts" :key="contract.address">
            <td>{{ contract.label }}</td><td><code>{{ contract.address }}</code></td><td>{{ formatNim(contract.balance) }}</td><td>{{ new Date(contract.expiry).toLocaleString() }}</td><td>{{ contract.registered ? 'Recognized' : 'Not registered / inactive' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
