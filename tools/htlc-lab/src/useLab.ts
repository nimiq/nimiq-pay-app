import type { InjectionKey } from 'vue'
import { computed, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { LabEngine } from './engine'
import { CoreGateway } from './gateway'
import { initialState, scenarios } from './model'
import { formatNim, parseLuna, parseNim } from './protocol'

export function useLab() {
  const state = reactive(initialState())
  const gateway = new CoreGateway()
  let engine = new LabEngine(state, gateway)
  const depositForm = reactive({ amount: '0.01', fee: '0' })
  const words = ref('')
  const spamWords = ref('')
  const showSpamWords = ref(false)
  const working = ref(false)
  const busyReason = computed(() => working.value ? 'Finish or cancel the current action first.' : state.busy ? 'Wait for the current transaction operation to finish.' : '')
  const notification = ref('')
  const walletStorageKey = 'htlc-lab.wallets.v1'
  const savedWallets = { owner: '', spammer: '' }
  try {
    const stored = JSON.parse(localStorage.getItem(walletStorageKey) ?? '{}')
    if (typeof stored.owner === 'string' && stored.owner) {
      state.owner = gateway.importOwner(stored.owner)
      savedWallets.owner = stored.owner
    }
    if (typeof stored.spammer === 'string' && stored.spammer) {
      state.spammer = gateway.importSpammer(stored.spammer)
      spamWords.value = stored.spammer
      savedWallets.spammer = stored.spammer
    }
  }
  catch {
    state.error = 'Saved wallets could not be fully restored. Clear saved wallets and import again, or check browser storage permissions.'
  }

  function saveWallets() {
    try {
      localStorage.setItem(walletStorageKey, JSON.stringify(savedWallets))
    }
    catch { throw new Error('Wallet loaded, but could not be saved. Back up its recovery words before refreshing; check browser storage permissions.') }
  }

  function forgetSavedWallets() {
    try {
      localStorage.removeItem(walletStorageKey)
    }
    catch { throw new Error('Could not clear saved wallets. Check browser storage permissions.') }
    savedWallets.owner = ''
    savedWallets.spammer = ''
    notification.value = 'Saved wallets cleared. Loaded keys remain available until this page closes. Back up recovery words before leaving.'
  }
  const reviewRequest = shallowRef<{ description: string, broadcast: boolean }>()
  let reviewResolver: ((approved: boolean) => void) | undefined
  const form = reactive({ scenario: 'two' as typeof scenarios[number]['id'], amount: '0.01', fee: '0', expiryMinutes: 5, count: 250, appClosed: false })
  const selected = computed(() => scenarios.find(s => s.id === (state.config?.scenario ?? form.scenario))!)
  const action = computed(() => ({ 'ready-claim': 'Claim next existing HTLC', 'ready-start': 'Create test HTLC A', 'ready-new': 'Create HTLC B', 'ready-drain': 'Return A through cosigner', 'ready-spam': 'Start spam batch' }[state.stage as string] ?? ''))

  async function perform(task: () => void | Promise<void>) {
    if (working.value || state.busy)
      return
    working.value = true
    state.error = ''
    try {
      await task()
    }
    catch (error) { state.error = error instanceof Error ? error.message : 'Operation failed. Check connectivity and current transaction state.' }
    finally { working.value = false }
  }

  function importOwner() {
    try {
      state.owner = gateway.importOwner(words.value)
      savedWallets.owner = words.value.trim()
      saveWallets()
    }
    finally { words.value = '' }
  }

  async function connect() {
    state.connected = false
    state.message = 'Connecting the light client and verifying the cosigner network. This can take a minute.'
    await gateway.connect(state.network)
    state.connected = true
    await engine.refresh()
    state.message = 'Connected. Fund the displayed addresses, close the app, then review a scenario.'
  }

  function generateSpammer() {
    const result = gateway.generateSpammer()
    state.spammer = result.address
    spamWords.value = result.words
    showSpamWords.value = true
    savedWallets.spammer = result.words
    saveWallets()
  }

  function review(description: string, broadcast = true) {
    reviewRequest.value = { description, broadcast }
    return new Promise<boolean>((resolve) => {
      reviewResolver = resolve
    })
  }

  function resolveReview(approved: boolean) {
    reviewRequest.value = undefined
    reviewResolver?.(approved)
    reviewResolver = undefined
  }

  async function start() {
    if (!form.appClosed)
      throw new Error('Close the app and confirm the checkbox before setup.')
    const config = { scenario: form.scenario, amount: parseNim(form.amount), fee: parseLuna(form.fee), expiryMinutes: Number(form.expiryMinutes), count: Number(form.count) }
    if (!await review(`Check existing HTLCs first. If any remain funded, stop for claim review before testing. Otherwise create HTLC A with ${formatNim(config.amount)} NIM. Fee: ${config.fee} Luna. Funds remain recoverable by the imported owner. Later steps require a separate review.`))
      return
    await engine.start(config)
  }

  async function deposit() {
    const value = parseNim(depositForm.amount)
    const fee = parseLuna(depositForm.fee)
    if (await review(`Send 1 normal transaction from the spam wallet to the app wallet. Amount: ${formatNim(value)} NIM. Fee: ${fee} Luna. Total debit: ${formatNim(value + fee)} NIM. The app may stay open for this deposit check.`))
      await engine.deposit(value, fee)
  }

  async function advance() {
    const config = state.config!
    const existing = state.existingContracts.find(c => c.balance > 0)
    const description = state.stage === 'ready-claim'
      ? `Claim existing HTLC ${existing?.address ?? ''} back to the app wallet. Current balance: ${formatNim(existing?.balance ?? 0)} NIM; fee: ${config.fee} Luna. Use the cosigner before expiry or owner timeout after expiry. One claim transaction; wait for confirmation before continuing.`
      : state.stage === 'ready-start'
        ? `Recheck existing HTLCs, then create test HTLC A with ${formatNim(config.amount)} NIM plus ${config.fee} Luna fee. No test funding proceeds while existing HTLCs remain funded.`
        : state.stage === 'ready-spam'
          ? `${config.count} transfers to the app wallet, each 0.00001 NIM + ${config.fee} Luna fee. Total debit: ${formatNim(config.count * (1 + config.fee))} NIM from the spam wallet. Maximum 2 per second / 20 unresolved.`
          : state.stage === 'ready-drain'
            ? `Return A’s entire live balance to the app wallet through the cosigner, less ${config.fee} Luna fee.`
            : `Create HTLC B with ${formatNim(config.amount)} NIM from the app wallet, plus ${config.fee} Luna fee.`
    if (await review(description))
      await engine.advance()
  }

  async function cleanup(address?: string) {
    const source = address ?? state.spammer
    if (await review(`Return the entire live balance of ${source} to the app wallet, less ${state.config!.fee} Luna fee. This changes the test state.`))
      await engine.cleanup(address)
  }

  async function retry(hash: string) {
    const tx = state.transactions.find(tx => tx.hash === hash)!
    if (await review(`Recheck ${hash}, then rebroadcast only its identical signed bytes if still unresolved. Value: ${formatNim(tx.value)} NIM; fee: ${tx.fee} Luna. No new hash or additional transfer is created.`))
      await engine.retry(hash)
  }

  async function faucet(address: string) {
    await gateway.faucet(address)
    notification.value = 'Faucet accepted the request. Wait for the displayed balance to update; do not repeatedly request funds.'
  }

  function exportReport() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(engine.report(), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `htlc-lab-${state.network}-${state.runId || 'setup'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function scanInventory() {
    if (!state.connected || !state.owner)
      throw new Error('Import the app wallet and connect before scanning HTLCs.')
    notification.value = 'Scanning wallet and extension history for all HTLCs, including empty contracts. This can take a while for long histories.'
    try {
      const contracts = await gateway.discoverHtlcs(state.owner, true)
      for (const known of [...state.contracts, ...state.existingContracts]) {
        const fresh = contracts.find(c => c.address === known.address)
        if (fresh)
          known.balance = fresh.balance
      }
      state.htlcInventory = contracts
    }
    catch (error) {
      notification.value = 'HTLC scan did not finish. Previous results remain displayed; retry the scan.'
      throw error
    }
    state.inventoryUpdatedAt = Date.now()
    notification.value = `HTLC scan complete. Found ${state.htlcInventory.length} contracts. Balances update when wallet transactions arrive.`
  }

  async function reset() {
    await engine.refresh()
    if (state.contracts.some(c => c.balance > 0) || state.transactions.some(tx => tx.state !== 'confirmed' && tx.state !== 'failed'))
      throw new Error('Clean up funded contracts and resolve submitted transactions before a new run.')
    if (!await review('Export the current report first. Clear this run and keep the loaded wallets?', false))
      return
    const { owner, spammer, network, connected, ownerBalance, spamBalance, head, htlcInventory, inventoryUpdatedAt } = state
    Object.assign(state, initialState(), { owner, spammer, network, connected, ownerBalance, spamBalance, head, htlcInventory, inventoryUpdatedAt })
    engine = new LabEngine(state, gateway)
    form.appClosed = false
  }

  watch(() => [state.connected, state.owner, state.spammer, ...state.contracts.map(c => c.address), ...state.existingContracts.map(c => c.address), ...state.htlcInventory.map(c => c.address)], () => {
    if (!state.connected)
      return
    const addresses = [state.owner, state.spammer, ...state.contracts.map(c => c.address), ...state.existingContracts.map(c => c.address), ...state.htlcInventory.map(c => c.address)].filter(Boolean)
    void gateway.listen(addresses, kind => engine.notifyChainChanged(kind)).catch(() => {
      state.error = 'Could not subscribe to chain updates. Reconnect before continuing.'
    })
  })

  const timer = setInterval(() => {
    if (!working.value)
      void engine.tick()
  }, 500)
  function beforeUnload(event: BeforeUnloadEvent) {
    if (state.owner || state.spammer) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', beforeUnload)
  onUnmounted(() => {
    clearInterval(timer)
    void gateway.stopListening().catch(() => {})
    window.removeEventListener('beforeunload', beforeUnload)
  })

  return { state, scanInventory, busyReason, form, depositForm, deposit, words, spamWords, showSpamWords, working, notification, selected, action, scenarios, reviewRequest, resolveReview, perform, forgetSavedWallets, importOwner, connect, generateSpammer, start, advance, cleanup, retry, faucet, exportReport, reset, cancel: () => engine.cancel() }
}

export type Lab = ReturnType<typeof useLab>
export const labKey: InjectionKey<Lab> = Symbol('htlc-lab')
