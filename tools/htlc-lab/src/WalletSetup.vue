<script setup lang="ts">
import { computed, inject } from 'vue'
import { formatNim } from './protocol'
import { labKey } from './useLab'

const lab = inject(labKey)!
const deposits = computed(() => lab.state.transactions.filter(tx => tx.kind === 'deposit'))
const depositPending = computed(() => deposits.value.some(tx => !['confirmed', 'failed'].includes(tx.state)))
const inventory = computed(() => [...new Map([
  ...lab.state.htlcInventory,
  ...lab.state.existingContracts,
  ...lab.state.contracts,
].map(contract => [contract.address, contract])).values()])
const inventoryReason = computed(() => lab.busyReason.value || (!lab.state.owner ? 'Import the app wallet first.' : !lab.state.connected ? 'Connect to the network before scanning HTLCs.' : ''))
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <span class="step-number">01</span><h2>Prepare wallets</h2>
    </div>
    <p class="hint">
      Use a dedicated test wallet. Keep recovery words private. Both wallets restore automatically from this browser’s local storage. Recovery words are stored unencrypted on this browser profile. Refreshing still loses run tracking; export your report first. Back up generated words before funding.
    </p>
    <button class="secondary" :disabled="lab.working.value || lab.state.busy" :aria-describedby="(lab.working.value || lab.state.busy) ? 'walletsetup-disabled-0' : undefined" @click="lab.perform(lab.forgetSavedWallets)">
      Clear saved wallets
    </button><p v-if="lab.working.value || lab.state.busy" id="walletsetup-disabled-0" class="hint disabled-reason">
      {{ lab.busyReason.value }}
    </p>
    <p class="hint">
      Removes browser storage only. Loaded wallets and the current run remain usable until you close this page.
    </p>
    <div class="wallet-grid">
      <div>
        <h3>App wallet</h3>
        <p class="hint">
          Import the same 12 words used in Nimiq Pay. Verify the derived address matches before sending funds.
        </p>
        <template v-if="!lab.state.owner">
          <label for="owner-words">12 recovery words</label>
          <textarea id="owner-words" v-model="lab.words.value" autocomplete="off" autocapitalize="off" :spellcheck="false" rows="3" placeholder="Enter recovery words locally" />
          <button :disabled="lab.working.value || !lab.words.value.trim()" :aria-describedby="(lab.working.value || !lab.words.value.trim()) ? 'walletsetup-disabled-1' : undefined" @click="lab.perform(lab.importOwner)">
            Import wallet
          </button><p v-if="lab.working.value || !lab.words.value.trim()" id="walletsetup-disabled-1" class="hint disabled-reason">
            {{ lab.busyReason.value || 'Enter the app wallet’s 12 recovery words first.' }}
          </p>
        </template>
        <template v-else>
          <code class="address">{{ lab.state.owner }}</code>
          <p class="balance">
            {{ lab.state.connected ? formatNim(lab.state.ownerBalance) : 'Not synced' }} <span>NIM</span>
          </p>
          <p class="hint">
            Keep funds here for HTLC A, B, and fees.
          </p>
          <button v-if="lab.state.network === 'testnet'" class="secondary" :disabled="!lab.state.connected || lab.working.value || lab.state.busy" :aria-describedby="(!lab.state.connected || lab.working.value || lab.state.busy) ? 'walletsetup-disabled-2' : undefined" @click="lab.perform(() => lab.faucet(lab.state.owner))">
            Request testnet funds
          </button><p v-if="(lab.state.network === 'testnet') && (!lab.state.connected || lab.working.value || lab.state.busy)" id="walletsetup-disabled-2" class="hint disabled-reason">
            {{ lab.busyReason.value || 'Connect to testnet before requesting funds.' }}
          </p>
        </template>
      </div>
      <div>
        <h3>Spam wallet</h3>
        <p class="hint">
          Separate sender for 0.00001 NIM receipts. Fund this address manually on either network, or request testnet funds. Never use the app wallet as its own spam sender.
        </p>
        <button v-if="!lab.state.spammer" class="secondary" :disabled="lab.working.value || lab.state.busy" :aria-describedby="(lab.working.value || lab.state.busy) ? 'walletsetup-disabled-3' : undefined" @click="lab.perform(lab.generateSpammer)">
          Generate spam wallet
        </button><p v-if="(!lab.state.spammer) && (lab.working.value || lab.state.busy)" id="walletsetup-disabled-3" class="hint disabled-reason">
          {{ lab.busyReason.value }}
        </p>
        <template v-if="lab.state.spammer">
          <code class="address">{{ lab.state.spammer }}</code>
          <p class="balance">
            {{ lab.state.connected ? formatNim(lab.state.spamBalance) : 'Not synced' }} <span>NIM</span>
          </p>
          <div class="actions">
            <button class="secondary" :aria-expanded="lab.showSpamWords.value" aria-controls="spam-recovery-words" @click="lab.showSpamWords.value = !lab.showSpamWords.value">
              {{ lab.showSpamWords.value ? 'Hide' : 'Show' }} recovery words
            </button>
            <button v-if="lab.state.network === 'testnet'" class="secondary" :disabled="!lab.state.connected || lab.working.value || lab.state.busy" :aria-describedby="(!lab.state.connected || lab.working.value || lab.state.busy) ? 'walletsetup-disabled-4' : undefined" @click="lab.perform(() => lab.faucet(lab.state.spammer))">
              Request testnet funds
            </button><p v-if="(lab.state.network === 'testnet') && (!lab.state.connected || lab.working.value || lab.state.busy)" id="walletsetup-disabled-4" class="hint disabled-reason">
              {{ lab.busyReason.value || 'Connect to testnet before requesting funds.' }}
            </p>
          </div>
          <p v-if="lab.showSpamWords.value" id="spam-recovery-words" class="secret">
            {{ lab.spamWords.value }}
          </p>
          <p class="hint">
            Back these words up privately. They are excluded from reports. Faucet limits require waiting or manual funding, not repeated requests.
          </p>
        </template>
      </div>
    </div>
    <div class="network-bar">
      <label for="network">Network</label>
      <select id="network" v-model="lab.state.network" :disabled="lab.state.connected || lab.working.value || lab.state.stage !== 'idle'">
        <option value="testnet">
          Testnet
        </option><option value="mainnet">
          Mainnet · real NIM
        </option>
      </select>
      <button :disabled="!lab.state.owner || lab.working.value || lab.state.busy || lab.state.stage !== 'idle'" :aria-describedby="(!lab.state.owner || lab.working.value || lab.state.busy || lab.state.stage !== 'idle') ? 'walletsetup-disabled-5' : undefined" @click="lab.perform(lab.connect)">
        {{ lab.state.connected ? 'Reconnect' : 'Connect' }}
      </button><p v-if="!lab.state.owner || lab.working.value || lab.state.busy || lab.state.stage !== 'idle'" id="walletsetup-disabled-5" class="hint disabled-reason">
        {{ lab.busyReason.value || (!lab.state.owner ? 'Import the app wallet first.' : 'Finish and clear the HTLC run before reconnecting.') }}
      </p>
      <span class="hint">{{ lab.state.connected ? `Block ${lab.state.head.height.toLocaleString()} · network locked for this session` : 'Client and cosigner must agree before signing.' }}</span>
    </div>
  </section>
  <section class="panel" aria-labelledby="inventory-title">
    <h2 id="inventory-title">
      App wallet HTLCs
    </h2>
    <p>See funded and empty HTLCs owned by the imported app wallet, including older contracts and extension chains. This scan only reads chain state; it does not claim funds.</p>
    <button class="secondary" :disabled="!!inventoryReason" :aria-describedby="inventoryReason ? 'inventory-disabled-reason' : undefined" @click="lab.perform(lab.scanInventory)">
      Find / refresh HTLCs
    </button>
    <p v-if="inventoryReason" id="inventory-disabled-reason" class="hint disabled-reason">
      {{ inventoryReason }}
    </p>
    <p class="hint">
      {{ lab.state.inventoryUpdatedAt ? `Last full history scan: ${new Date(lab.state.inventoryUpdatedAt).toLocaleString()}.` : 'Run a full scan to discover older HTLCs. Known contracts from this session appear immediately.' }} Balances update through transaction listeners. Scan again to discover contracts created outside this tool.
    </p>
    <p v-if="!inventory.length">
      {{ lab.state.inventoryUpdatedAt ? 'No HTLCs found for this app wallet.' : 'No HTLCs loaded yet.' }}
    </p>
    <div v-else class="table-scroll" role="region" aria-label="All app wallet HTLCs" tabindex="0">
      <table>
        <thead><tr><th>HTLC address</th><th>Current balance · NIM</th><th>Status</th><th>Expiry</th></tr></thead><tbody>
          <tr v-for="contract in inventory" :key="contract.address">
            <td><code>{{ contract.address }}</code></td><td>{{ lab.state.connected ? formatNim(contract.balance) : 'Not synced' }}</td><td>{{ contract.balance === 0 ? 'Empty' : lab.state.head.timestamp > contract.expiry ? 'Expired · funded' : 'Funded' }}</td><td>{{ contract.expiry ? new Date(contract.expiry).toLocaleString() : 'Unknown' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <section class="panel" aria-labelledby="deposit-title">
    <h2 id="deposit-title">
      Test a normal deposit
    </h2>
    <p>Send NIM from the spam wallet to the imported app wallet. Keep Nimiq Pay open to check incoming deposits, or reopen it after confirmation to check discovery.</p>
    <p class="hint">
      Fund the spam wallet above. Run deposits separately from HTLC scenarios so they do not change the controlled test history. The amount is in NIM; fees are in Luna.
    </p>
    <fieldset class="config-grid" :disabled="lab.working.value || lab.state.busy || lab.state.stage !== 'idle' || depositPending">
      <div><label for="deposit-amount">Deposit amount · NIM</label><input id="deposit-amount" v-model="lab.depositForm.amount" inputmode="decimal"><small>Minimum 0.00001 NIM. Up to 5 decimal places.</small></div>
      <div><label for="deposit-fee">Deposit fee · Luna</label><input id="deposit-fee" v-model="lab.depositForm.fee" inputmode="numeric"><small>The spam wallet needs the amount plus this fee.</small></div>
    </fieldset>
    <div class="actions">
      <button :disabled="!lab.state.connected || !lab.state.spammer || lab.working.value || lab.state.busy || lab.state.stage !== 'idle' || depositPending" :aria-describedby="(!lab.state.connected || !lab.state.spammer || lab.working.value || lab.state.busy || lab.state.stage !== 'idle' || depositPending) ? 'walletsetup-disabled-6' : undefined" @click="lab.perform(lab.deposit)">
        Review &amp; send deposit
      </button><p v-if="!lab.state.connected || !lab.state.spammer || lab.working.value || lab.state.busy || lab.state.stage !== 'idle' || depositPending" id="walletsetup-disabled-6" class="hint disabled-reason">
        {{ lab.busyReason.value || (!lab.state.connected ? 'Connect to the network first.' : !lab.state.spammer ? 'Generate or restore the spam wallet first.' : lab.state.stage !== 'idle' ? 'Finish and clear the HTLC run first.' : 'Wait for the submitted deposit to resolve; check its hash in the ledger.') }}
      </p>
      <button v-if="deposits.length" class="secondary" @click="lab.exportReport">
        Export deposit report
      </button>
      <button v-if="deposits.length" class="secondary" :disabled="lab.working.value || lab.state.busy || depositPending" :aria-describedby="(lab.working.value || lab.state.busy || depositPending) ? 'walletsetup-disabled-7' : undefined" @click="lab.perform(lab.reset)">
        Clear deposit session
      </button><p v-if="(deposits.length) && (lab.working.value || lab.state.busy || depositPending)" id="walletsetup-disabled-7" class="hint disabled-reason">
        {{ lab.busyReason.value || 'Wait for the submitted deposit to resolve before clearing this session.' }}
      </p>
    </div>
    <p v-if="!lab.state.connected || !lab.state.spammer" class="hint">
      Load both wallets and connect before sending.
    </p>
    <p v-if="lab.state.stage !== 'idle'" class="hint">
      Finish and clear the HTLC run before testing deposits.
    </p>
    <p v-if="deposits.length" role="status">
      Latest deposit: {{ deposits[deposits.length - 1].state }}. {{ depositPending ? 'Waiting for confirmation. Inspect or recheck the same hash in the transaction ledger below; do not send a replacement.' : 'Check the app shows the incoming amount once, with no duplicate receipt or false payment. Record observations below, then export and clear this session before an HTLC test.' }}
    </p>
  </section>
</template>
