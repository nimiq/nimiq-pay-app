<script setup lang="ts">
import { computed, inject } from 'vue'
import { formatNim } from './protocol'
import { labKey } from './useLab'

const lab = inject(labKey)!
const depositSession = computed(() => lab.state.transactions.some(tx => tx.kind === 'deposit'))
const locked = computed(() => lab.working.value || lab.state.busy)
const cleanupAllowed = computed(() => ['observe', 'cancelled', 'failed'].includes(lab.state.stage) && !lab.state.observing)
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <span class="step-number">03</span><h2>Observe &amp; report</h2>
    </div>
    <p><strong>Expected in Nimiq Pay:</strong> {{ depositSession ? 'The incoming deposit appears once and adds the sent amount to the app balance. Record the observed result below; chain confirmation does not prove the app displayed it.' : lab.selected.value.expected }}</p>
    <p v-if="!depositSession" class="hint">
      Only open the app after “Chain setup verified.” Check balance and transaction history after an ordinary restart, then after a fresh import of the same account. These are manual app checks; chain confirmation alone does not mean the app passed.
    </p>
    <fieldset v-if="!depositSession" class="config-grid" :disabled="!lab.state.runId">
      <div>
        <label for="restart">Ordinary restart</label><select id="restart" v-model="lab.state.verdicts.restart">
          <option value="not-checked">
            Not checked
          </option><option value="pass">
            Pass
          </option><option value="fail">
            Fail
          </option><option value="blocked">
            Blocked
          </option>
        </select>
      </div>
      <div>
        <label for="fresh">Fresh account import</label><select id="fresh" v-model="lab.state.verdicts.freshImport">
          <option value="not-checked">
            Not checked
          </option><option value="pass">
            Pass
          </option><option value="fail">
            Fail
          </option><option value="blocked">
            Blocked
          </option>
        </select>
      </div>
    </fieldset>
    <label for="notes">What did the app show?</label>
    <textarea id="notes" v-model="lab.state.verdicts.notes" :disabled="!lab.state.runId && !lab.state.transactions.length" rows="3" placeholder="App version, device/OS, observed balance, missing history, duplicates, recovery hashes. Never include recovery words." />
    <p v-if="!depositSession" class="hint">
      App recovery changes chain state. For an independent fresh-import test, repeat the scenario with fresh contracts after cleanup. Do not interpret the second check as recovery from the original untouched setup.
    </p>
    <div class="actions">
      <button class="secondary" :disabled="!lab.state.runId && !lab.state.transactions.length" :aria-describedby="(!lab.state.runId && !lab.state.transactions.length) ? 'runreport-disabled-0' : undefined" @click="lab.exportReport">
        Export JSON report
      </button><p v-if="!lab.state.runId && !lab.state.transactions.length" id="runreport-disabled-0" class="hint disabled-reason">
        {{ 'Start a scenario or send a deposit before exporting a report.' }}
      </p>
    </div>
    <p v-if="!lab.state.runId && !lab.state.transactions.length" class="hint">
      Start a scenario to record app results and export its chain evidence.
    </p>
    <details v-if="lab.state.transactions.length">
      <summary>Transaction ledger · {{ lab.state.transactions.length }} hashes</summary>
      <p class="hint">
        For unresolved direct transfers, recheck before rebroadcasting the same signed bytes. This keeps the original hash and cannot create a second transfer. Cosigner/recovery requests are not replayed here.
      </p>
      <div class="table-scroll ledger" role="region" aria-label="Transaction ledger" tabindex="0">
        <table>
          <thead><tr><th>Purpose</th><th>Hash</th><th>Amount · NIM</th><th>Fee · Luna</th><th>Chain state</th><th>Action</th></tr></thead><tbody>
            <tr v-for="tx in lab.state.transactions" :key="tx.hash">
              <td>{{ tx.kind }} {{ tx.index ?? '' }}</td><td><code>{{ tx.hash }}</code></td><td>{{ formatNim(tx.value) }}</td><td>{{ tx.fee }}</td><td>{{ tx.state }}</td>
              <td>
                <button v-if="['unknown', 'pending'].includes(tx.state) && ['a', 'b', 'spam', 'return', 'deposit'].includes(tx.kind)" class="secondary" :disabled="locked" :aria-describedby="(locked) ? `runreport-disabled-1-${tx.hash}` : undefined" @click="lab.perform(() => lab.retry(tx.hash))">
                  Recheck &amp; rebroadcast
                </button><p v-if="(['unknown', 'pending'].includes(tx.state) && ['a', 'b', 'spam', 'return', 'deposit'].includes(tx.kind)) && (locked)" :id="`runreport-disabled-1-${tx.hash}`" class="hint disabled-reason">
                  {{ lab.busyReason.value }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
    <details v-if="lab.state.evidence.length">
      <summary>Chain evidence &amp; operator timeline</summary><ol class="timeline">
        <li v-for="(item, index) in lab.state.evidence" :key="index">
          <time>{{ new Date(item.at).toLocaleTimeString() }}</time> {{ item.message }}
        </li>
      </ol>
    </details>
    <div v-if="lab.state.stage !== 'idle'" class="cleanup">
      <h3>Finish observation, then clean up</h3>
      <p class="hint">
        Export your report first. Cleanup changes the test state. Only tool-created contracts can be drained. Before expiry the cosigner must allow spending; near expiry, wait for chain time to pass it and use owner timeout recovery.
      </p>
      <label v-if="lab.state.stage === 'observe'" class="check"><input v-model="lab.state.observing" type="checkbox"> App observation is in progress — keep cleanup locked.</label>
      <p v-if="lab.state.observing" class="hint">
        Finish both checks or record why one is blocked. Close the app, then untick the observation lock before cleanup.
      </p>
      <div class="actions">
        <button v-for="contract in lab.state.contracts" :key="contract.address" class="secondary" :disabled="!cleanupAllowed || locked || contract.balance <= (lab.state.config?.fee ?? 0)" :aria-describedby="(!cleanupAllowed || locked || contract.balance <= (lab.state.config?.fee ?? 0)) ? 'runreport-disabled-2' : undefined" @click="lab.perform(() => lab.cleanup(contract.address))">
          Return {{ contract.label }} funds
        </button>
        <button v-if="lab.state.spammer" class="secondary" :disabled="!cleanupAllowed || locked || lab.state.spamBalance <= (lab.state.config?.fee ?? 0)" :aria-describedby="(!cleanupAllowed || locked || lab.state.spamBalance <= (lab.state.config?.fee ?? 0)) ? 'runreport-disabled-3' : undefined" @click="lab.perform(() => lab.cleanup())">
          Return spam-wallet funds
        </button><p v-if="(lab.state.spammer) && (!cleanupAllowed || locked || lab.state.spamBalance <= (lab.state.config?.fee ?? 0))" id="runreport-disabled-3" class="hint disabled-reason">
          {{ lab.busyReason.value || (lab.state.observing ? 'Finish observation and untick its lock before returning funds.' : !cleanupAllowed ? 'Finish or cancel the scenario before cleanup.' : 'The spam wallet has no spendable balance after the fee.') }}
        </p>
        <button class="secondary" :disabled="!cleanupAllowed || locked" :aria-describedby="(!cleanupAllowed || locked) ? 'runreport-disabled-4' : undefined" @click="lab.perform(lab.reset)">
          Clear run
        </button><p v-if="!cleanupAllowed || locked" id="runreport-disabled-4" class="hint disabled-reason">
          {{ lab.busyReason.value || (lab.state.observing ? 'Finish observation and untick its lock before clearing this run.' : 'Finish or cancel the scenario before clearing this run.') }}
        </p>
      </div>
      <p v-if="!cleanupAllowed || locked || lab.state.contracts.some(c => c.balance <= (lab.state.config?.fee ?? 0))" id="runreport-disabled-2" class="hint disabled-reason">
        {{ lab.busyReason.value || (lab.state.observing ? 'Finish observation and untick its lock before returning funds.' : !cleanupAllowed ? 'Finish or cancel the scenario before cleanup.' : 'No spendable balance remains after the fee.') }}
      </p>
      <p class="hint">
        Wait for cleanup confirmation and zero contract balances before clearing the run or closing the page. If the app already recovered funds, zero balance is expected; do not send another recovery transaction.
      </p>
    </div>
  </section>
</template>
