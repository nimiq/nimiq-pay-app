import type { Config, Gateway, LabState, Prepared, Tracked } from './model'
import { formatNim } from './protocol'

export class LabEngine {
  private lastSpamAt = -Infinity
  private lastPollAt = -Infinity
  private ticking = false
  private headChanged = false
  private balancesChanged = false

  notifyChainChanged(kind: 'head' | 'balances') {
    if (kind === 'head')
      this.headChanged = true
    else
      this.balancesChanged = true
  }

  constructor(readonly state: LabState, private gateway: Gateway, private clock = Date.now) {}

  private note(message: string) {
    this.state.message = message
    this.state.evidence.push({ at: Date.now(), message })
  }

  private assertReady() {
    if (!this.state.connected || !this.state.owner)
      throw new Error('Import a wallet and connect first.')
    if (this.state.busy)
      throw new Error('An operation is already running. Wait for it to finish.')
  }

  private unresolved() {
    return this.state.transactions.filter(tx => tx.state !== 'confirmed' && tx.state !== 'failed')
  }

  async refresh() {
    this.state.head = await this.gateway.head()
    this.state.ownerBalance = await this.gateway.balance(this.state.owner)
    if (this.state.spammer)
      this.state.spamBalance = await this.gateway.balance(this.state.spammer)
    for (const contract of this.state.contracts) {
      contract.balance = await this.gateway.balance(contract.address)
      // Expired/drained contracts may no longer be served by the cosigner.
      contract.registered = await this.gateway.registered(contract.address)
    }
  }

  async start(config: Config) {
    this.assertReady()
    if (this.state.transactions.some(tx => tx.kind === 'deposit'))
      throw new Error('Export and clear the deposit session before starting an HTLC scenario.')
    if (!['idle', 'ready-start'].includes(this.state.stage))
      throw new Error('Finish this run and export its report before resetting.')
    if (!Number.isSafeInteger(config.amount) || config.amount < 1 || !Number.isSafeInteger(config.fee) || config.fee < 0
      || !Number.isInteger(config.count) || config.count < 1 || config.count > 1000
      || !Number.isSafeInteger(config.count * (1 + config.fee))
      || !Number.isFinite(config.expiryMinutes) || config.expiryMinutes < 1 || config.expiryMinutes > 1440) {
      throw new Error('Use positive NIM amounts with up to 5 decimal places, 1–1,000 transfers, and expiry between 1 and 1,440 minutes.')
    }
    this.state.busy = true
    try {
      this.note('Checking owner history and HTLC extension history for existing funded contracts. Keep the app closed.')
      const existing = await this.gateway.discoverHtlcs(this.state.owner)
      if (this.state.stage as string === 'cancelled')
        throw new Error('Scenario cancelled during existing HTLC discovery.')
      if (existing.length) {
        this.state.existingContracts = existing
        this.state.config = { ...config }
        this.state.runId ||= crypto.randomUUID()
        this.state.stage = 'ready-claim'
        this.note(`Found ${existing.length} funded existing HTLCs. Claim them before creating any test contract.`)
        return
      }
      await this.refresh()
      const needed = config.scenario === 'two' || config.scenario === 'bomb'
        ? 2 * (config.amount + config.fee)
        : config.scenario === 'drained' ? config.amount + 3 * config.fee : config.amount + config.fee
      if (!Number.isSafeInteger(needed) || this.state.ownerBalance < needed)
        throw new Error(`Insufficient owner funds. Reserve at least ${formatNim(needed)} NIM for this scenario.`)
      if (config.amount <= config.fee)
        throw new Error('HTLC amount must exceed the cleanup fee.')
      this.state.config = { ...config }
      this.state.runId ||= crypto.randomUUID()
      this.note(`Starting balances at block ${this.state.head.height}: owner ${formatNim(this.state.ownerBalance)} NIM; spam wallet ${formatNim(this.state.spamBalance)} NIM.`)
      await this.fund('A')
    }
    catch (error) {
      if (this.state.stage === 'idle' && this.state.transactions.length === 0) {
        this.state.config = null
        this.state.runId = ''
      }
      throw error
    }
    finally { this.state.busy = false }
  }

  private async submit(prepared: Prepared, kind: Tracked['kind'], index?: number) {
    if (this.state.stage === 'cancelled' && kind !== 'cleanup' && kind !== 'return')
      throw new Error('Scenario cancelled before submission.')
    if (this.state.transactions.some(tx => tx.hash === prepared.hash))
      throw new Error('Duplicate hash blocked. Reconcile the existing transaction.')
    // Record BEFORE broadcast: even a rejected HTTP/RPC response can follow an accepted submission.
    const tracked: Tracked = { ...prepared, kind, index, submittedAt: Date.now(), state: 'unknown' }
    this.state.transactions.push(tracked)
    // Core can wait for a receipt before resolving sendTransaction. The tracked queue, not that
    // response, limits concurrency. Late responses must not downgrade independent chain evidence.
    void Promise.resolve().then(() => this.gateway.broadcast(prepared.hash)).then(() => {
      const tx = this.state.transactions.find(tx => tx.hash === prepared.hash)
      if (tx?.state === 'unknown')
        tx.state = 'pending'
    }, () => {
      const tx = this.state.transactions.find(tx => tx.hash === prepared.hash)
      if (tx && (tx.state === 'unknown' || tx.state === 'pending')) {
        tx.state = 'unknown'
        this.note(`Submission outcome unknown for ${prepared.hash}. Tracking the same hash; do not create a replacement.`)
      }
    })
  }

  private async fund(label: 'A' | 'B') {
    const config = this.state.config!
    await this.refresh()
    if (this.state.ownerBalance < config.amount + config.fee)
      throw new Error('Insufficient owner funds for the next HTLC.')
    const short = label === 'A' && (config.scenario === 'expired' || config.scenario === 'bomb')
    const expiry = Math.max(Date.now(), this.state.head.timestamp) + (short ? config.expiryMinutes * 60000 : 14 * 86400000) + this.state.contracts.length
    const prepared = await this.gateway.prepareHtlc(config.amount, config.fee, expiry)
    if (this.state.stage === 'cancelled')
      throw new Error('Scenario cancelled before funding.')
    this.state.contracts.push({ address: prepared.recipient, label, expiry, balance: 0, registered: false })
    this.state.stage = label === 'A' ? 'funding-a' : 'funding-b'
    this.note(`HTLC ${label} submitted. Keep the app closed; waiting for successful confirmation.`)
    await this.submit(prepared, label === 'A' ? 'a' : 'b')
  }

  async advance() {
    this.assertReady()
    if (this.unresolved().length)
      throw new Error('Wait for all submitted transactions to resolve.')
    if (this.state.stage === 'ready-start') {
      await this.start(this.state.config!)
      return
    }
    if (!['ready-claim', 'ready-drain', 'ready-spam', 'ready-new'].includes(this.state.stage))
      throw new Error('This step is not ready. Follow the current waiting instructions.')
    this.state.busy = true
    try {
      await this.refresh()
      if (this.state.stage === 'ready-claim') {
        const contract = this.state.existingContracts.find(c => c.balance > 0)
        if (!contract) {
          this.state.stage = 'ready-start'
          return
        }
        contract.balance = await this.gateway.balance(contract.address)
        if (contract.balance === 0) {
          this.note('This existing HTLC is already empty. Continue to the next claim or start step.')
          if (this.state.existingContracts.every(c => c.balance === 0))
            this.state.stage = 'ready-start'
          return
        }
        const fee = this.state.config!.fee
        if (contract.balance <= fee)
          throw new Error('Existing HTLC balance does not cover the claim fee. Cancel and restart with a lower fee.')
        const tx = await this.gateway.prepareDrain(contract.address, contract.balance - fee, fee, this.state.head.timestamp > contract.expiry)
        if (this.state.stage as string === 'cancelled')
          throw new Error('Scenario cancelled before claiming existing funds.')
        this.state.stage = 'claiming-existing'
        await this.submit(tx, 'claim')
        this.note('Claim submitted. Waiting for confirmation and zero live balance before continuing. Unknown submissions must remain unresolved.')
      }
      else if (this.state.stage === 'ready-drain') {
        const contract = this.state.contracts[0]
        const fee = this.state.config!.fee
        if (contract.balance <= fee)
          throw new Error('HTLC A no longer has enough funds to drain.')
        const tx = await this.gateway.prepareDrain(contract.address, contract.balance - fee, fee, false)
        if (this.state.stage as string === 'cancelled')
          throw new Error('Scenario cancelled before drain.')
        this.state.stage = 'draining-a'
        this.note('Returning A through the cosigner. Wait for confirmation before creating B.')
        await this.submit(tx, 'drain')
      }
      else if (this.state.stage === 'ready-spam') {
        if (!this.state.spammer)
          throw new Error('Generate and fund the separate spam wallet first.')
        const { count, fee } = this.state.config!
        if (this.state.spamBalance < count * (1 + fee))
          throw new Error(`Spam wallet needs ${formatNim(count * (1 + fee))} NIM (${count} transfers plus fees).`)
        if (this.state.head.timestamp <= this.state.contracts[0].expiry || this.state.contracts[0].balance <= 0)
          throw new Error('A must be expired and still funded before spam starts.')
        this.state.stage = 'spamming'
        this.note('Sending unique 0.00001 NIM transfers. Keep the app closed. B stays blocked until all transfers confirm.')
      }
      else {
        if (this.state.config!.scenario === 'bomb' && !this.spamComplete())
          throw new Error('Every requested spam transfer must confirm before B.')
        await this.fund('B')
      }
    }
    finally { this.state.busy = false }
  }

  private spamComplete() {
    const spam = this.state.transactions.filter(tx => tx.kind === 'spam')
    return spam.length === this.state.config!.count && new Set(spam.map(tx => tx.hash)).size === spam.length
      && spam.every(tx => tx.state === 'confirmed')
  }

  async tick(now = this.clock()) {
    if (!this.state.connected || !this.state.owner || this.state.busy || this.ticking)
      return
    this.ticking = true
    let actionLocked = false
    try {
      // Listeners invalidate snapshots; the timer only drains events and schedules spam/receipt checks.
      if (this.headChanged) {
        this.headChanged = false
        this.state.head = await this.gateway.head()
      }
      if (this.balancesChanged) {
        this.balancesChanged = false
        this.state.ownerBalance = await this.gateway.balance(this.state.owner)
        if (this.state.spammer)
          this.state.spamBalance = await this.gateway.balance(this.state.spammer)
        for (const contract of [...this.state.contracts, ...this.state.existingContracts, ...this.state.htlcInventory])
          contract.balance = await this.gateway.balance(contract.address)
      }
      // Inclusion listeners do not guarantee macro-block confirmation or report dropped sends.
      if (now - this.lastPollAt >= 3000 || now < this.lastPollAt) {
        for (const tx of this.unresolved()) {
          try {
            tx.state = await this.gateway.transaction(tx.hash)
            if (tx.state === 'confirmed' && (tx.kind === 'cleanup' || tx.kind === 'return'))
              this.note(`Return confirmed: ${tx.hash}. Check live balances before clearing this run.`)
          }
          catch { /* A failed lookup is not evidence that a transaction was never included. */ }
        }
        this.lastPollAt = Math.max(now, this.clock())
        if (['observe', 'cancelled', 'failed', 'idle'].includes(this.state.stage))
          this.state.error = ''
      }
      if (this.state.busy || this.state.stage === 'cancelled' || this.state.stage === 'failed' || this.state.stage === 'observe' || this.state.stage === 'idle')
        return
      this.state.busy = true
      actionLocked = true
      if (this.state.transactions.some(tx => tx.state === 'failed')) {
        this.state.stage = 'failed'
        this.note('A transaction failed. The scenario cannot pass. Export the report, then clean up remaining funds.')
        return
      }
      const config = this.state.config!
      if (this.state.stage === 'claiming-existing' && !this.unresolved().length) {
        for (const contract of this.state.existingContracts)
          contract.balance = await this.gateway.balance(contract.address)
        const claimed = this.state.transactions.filter(tx => tx.kind === 'claim').at(-1)!
        if (this.state.existingContracts.find(c => c.address === claimed.sender)?.balance !== 0)
          throw new Error('Claim confirmed but the HTLC is not empty yet. Waiting for a fresh account read.')
        this.state.stage = this.state.existingContracts.some(c => c.balance > 0) ? 'ready-claim' : 'ready-start'
        this.note(this.state.stage === 'ready-claim' ? 'Claim confirmed. Review the next existing HTLC.' : 'Existing HTLCs are empty. Continue to recheck history and create test HTLC A.')
      }
      if (this.state.stage === 'funding-a' && this.state.transactions.find(tx => tx.kind === 'a')?.state === 'confirmed') {
        if (this.state.contracts[0].balance !== config.amount)
          throw new Error('A’s live balance differs from setup. Keep the app closed and inspect external transactions.')
        this.state.stage = config.scenario === 'two' ? 'ready-new' : config.scenario === 'drained' ? 'ready-drain' : 'waiting-expiry'
        this.note(this.state.stage === 'waiting-expiry' ? 'A is confirmed. Waiting for chain time to pass expiry; do not open the app.' : 'A is confirmed and funded. Review and continue to the next transaction.')
      }
      if (this.state.stage === 'draining-a' && this.state.transactions.find(tx => tx.kind === 'drain')?.state === 'confirmed') {
        if (this.state.contracts[0].balance !== 0)
          throw new Error('A is not drained on-chain yet. Waiting for a fresh account read.')
        this.state.stage = 'ready-new'
        this.note('A is drained. Create B, then inspect whether the app restores A’s history without its old balance.')
      }
      if (this.state.stage === 'waiting-expiry' && this.state.head.timestamp > this.state.contracts[0].expiry) {
        if (this.state.contracts[0].balance !== config.amount)
          throw new Error('Expired A must remain fully funded for this scenario.')
        this.state.stage = config.scenario === 'bomb' ? 'ready-spam' : 'checking'
        this.note(config.scenario === 'bomb' ? 'A expired and remains funded. Fund the spam wallet, then start the reviewed spam batch.' : 'A expired and remains funded. Verifying setup.')
      }
      if (this.state.stage === 'spamming' && !this.state.paused) {
        const sent = this.state.transactions.filter(tx => tx.kind === 'spam').length
        if (sent < config.count && this.unresolved().length < 20 && now - this.lastSpamAt >= 500) {
          const reserved = this.unresolved().filter(tx => tx.kind === 'spam').length * (1 + config.fee)
          if (this.state.spamBalance < reserved + 1 + config.fee)
            throw new Error('Insufficient spam funds. Pause, fund the spam wallet, then resume; submitted hashes stay tracked.')
          const tx = await this.gateway.prepareSpam(this.state.runId, sent, config.fee)
          await this.submit(tx, 'spam', sent)
          this.lastSpamAt = Math.max(now, this.clock())
        }
        if (this.spamComplete()) {
          this.state.stage = 'ready-new'
          this.note('All requested spam transfers confirmed. Create B now; keep the app closed.')
        }
      }
      if (this.state.stage === 'funding-b' && this.state.transactions.find(tx => tx.kind === 'b')?.state === 'confirmed')
        this.state.stage = 'checking'
      if (this.state.stage === 'checking') {
        await this.verifySetup()
        this.state.stage = 'observe'
        this.state.observing = true
        this.note('Chain setup verified. Open the app now. Record app results separately; cleanup is locked during observation.')
      }
      this.state.error = ''
    }
    catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Chain check failed. Retry after connectivity returns.'
    }
    finally {
      if (actionLocked)
        this.state.busy = false
      this.ticking = false
    }
  }

  private async verifySetup() {
    await this.refresh()
    const { scenario, amount } = this.state.config!
    const a = this.state.contracts[0]
    const b = this.state.contracts[1]
    if (a.balance !== (scenario === 'drained' ? 0 : amount) || (b && b.balance !== amount))
      throw new Error('Live HTLC balances no longer match the scenario. Inspect external app activity before continuing.')
    if ((scenario === 'two' && !a.registered) || (b && !b.registered))
      throw new Error('Waiting for the cosigner to recognize each funded, unexpired contract.')
    if (scenario === 'bomb') {
      if (this.state.head.timestamp <= a.expiry)
        throw new Error('A is not expired according to chain time.')
      const depth = await this.gateway.historyDepth(this.state.owner, this.state.transactions.find(tx => tx.kind === 'a')!.hash, this.state.transactions.filter(tx => tx.kind === 'spam').map(tx => tx.hash), this.state.transactions.find(tx => tx.kind === 'b')!.hash)
      this.note(`History verified: A is ${depth} entries behind the newest transaction. All spam lies between B and A.`)
    }
    this.note(`Setup balances: owner ${formatNim(this.state.ownerBalance)} NIM; ${this.state.contracts.map(c => `${c.label} ${formatNim(c.balance)} NIM`).join('; ')}.`)
  }

  cancel() {
    if (this.state.stage === 'idle')
      return
    this.state.paused = true
    this.state.stage = 'cancelled'
    this.note('Cancelled. No further scenario submissions; already submitted transactions remain tracked. Export and clean up after they resolve.')
  }

  async retry(hash: string) {
    this.assertReady()
    const tx = this.state.transactions.find(tx => tx.hash === hash)
    if (!tx || !['a', 'b', 'spam', 'return', 'deposit'].includes(tx.kind) || !['unknown', 'pending'].includes(tx.state))
      throw new Error('Only unresolved direct transactions can be rechecked and rebroadcast.')
    this.state.busy = true
    try {
      try {
        tx.state = await this.gateway.transaction(hash)
      }
      catch { /* Absence is inconclusive. Reusing identical signed bytes cannot create a second transfer. */ }
      if (tx.state !== 'unknown' && tx.state !== 'pending') {
        this.note(`Recheck resolved ${hash} as ${tx.state}; no rebroadcast needed.`)
        return
      }
      if (tx.kind === 'spam' && this.clock() - this.lastSpamAt < 500)
        throw new Error('Wait at least half a second between spam submissions.')
      this.note(`Rebroadcasting the same signed transaction ${hash}. Amount, fee, validity height, and hash are unchanged.`)
      try {
        await this.gateway.rebroadcast(hash)
        tx.state = 'pending'
      }
      finally {
        if (tx.kind === 'spam')
          this.lastSpamAt = this.clock()
      }
    }
    finally { this.state.busy = false }
  }

  async deposit(value: number, fee: number) {
    this.assertReady()
    if (this.state.stage !== 'idle' || this.unresolved().length)
      throw new Error('Finish the HTLC run or wait for the pending deposit before sending another deposit.')
    if (!this.state.spammer || this.state.spammer === this.state.owner)
      throw new Error('Load a separate spam wallet first.')
    if (!Number.isSafeInteger(value) || value < 1 || !Number.isSafeInteger(fee) || fee < 0 || !Number.isSafeInteger(value + fee))
      throw new Error('Use a positive NIM amount with up to 5 decimal places and a nonnegative whole Luna fee.')
    this.state.busy = true
    try {
      await this.refresh()
      if (this.state.spamBalance < value + fee)
        throw new Error(`Insufficient spam-wallet funds. Fund at least ${formatNim(value + fee)} NIM, including the fee.`)
      await this.submit(await this.gateway.prepareReturn(value, fee), 'deposit')
      this.note('Deposit submitted. Keep the app open to test incoming deposits; wait for chain confirmation and check the app balance and history. Unknown submissions remain tracked in the ledger.')
    }
    finally { this.state.busy = false }
  }

  async cleanup(address?: string) {
    this.assertReady()
    if (this.state.observing || this.unresolved().length || !['observe', 'cancelled', 'failed'].includes(this.state.stage))
      throw new Error('End observation or cancel the run, then wait for all submitted transactions before cleanup.')
    this.state.busy = true
    try {
      await this.refresh()
      const fee = this.state.config!.fee
      if (address) {
        const contract = this.state.contracts.find(c => c.address === address)
        if (!contract)
          throw new Error('Cleanup is limited to contracts created by this tool.')
        if (contract.balance <= fee)
          throw new Error('Contract has no spendable balance after fee.')
        const tx = await this.gateway.prepareDrain(address, contract.balance - fee, fee, this.state.head.timestamp > contract.expiry)
        await this.submit(tx, 'cleanup')
      }
      else {
        if (!this.state.spammer || this.state.spamBalance <= fee)
          throw new Error('Spam wallet has no spendable balance after fee.')
        await this.submit(await this.gateway.prepareReturn(this.state.spamBalance - fee, fee), 'return')
      }
      this.note('Cleanup submitted. Wait for confirmation and refresh live balances before closing this page.')
    }
    finally { this.state.busy = false }
  }

  report() {
    const s = this.state
    // Explicit allowlist: never serialize the gateway, signing keys, or arbitrary errors.
    return {
      version: 2,
      units: { amounts: 'NIM', fees: 'Luna' },
      exportedAt: new Date().toISOString(),
      network: s.network,
      runId: s.runId,
      config: s.config ? { ...s.config, amount: s.config.amount / 100000 } : null,
      owner: s.owner,
      spammer: s.spammer,
      stage: s.stage,
      head: s.head,
      balances: { owner: s.ownerBalance / 100000, spammer: s.spamBalance / 100000 },
      inventoryUpdatedAt: s.inventoryUpdatedAt,
      htlcInventory: s.htlcInventory.map(c => ({ ...c, balance: c.balance / 100000 })),
      existingContracts: s.existingContracts.map(c => ({ ...c, balance: c.balance / 100000 })),
      contracts: s.contracts.map(c => ({ ...c, balance: c.balance / 100000 })),
      transactions: s.transactions.map(tx => ({ ...tx, value: tx.value / 100000 })),
      chainEvidence: s.evidence,
      manualAppResults: s.verdicts,
    }
  }
}
