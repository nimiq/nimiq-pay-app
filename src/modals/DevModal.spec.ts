import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'

const state = vi.hoisted(() => ({
  alertMessage: '',
  alertRole: 'confirm',
  clearTxHistory: vi.fn(),
  discoverRemoteSignersFromBlockchain: vi.fn(),
  getTransactionsByAddress: vi.fn(),
  isNativePlatform: vi.fn(),
  purgeRemoteSigners: vi.fn(),
  query: vi.fn(),
  recoverRemoteSigner: vi.fn(),
  run: vi.fn(),
  setNetworkOverride: vi.fn(),
  validateRemoteSignerAddress: vi.fn(),
  updater: {
    addListener: vi.fn(),
    current: vi.fn(),
    download: vi.fn(),
    getLatest: vi.fn(),
    list: vi.fn(),
    next: vi.fn(),
    set: vi.fn(),
  },
  verifyRemoteSignersDb: vi.fn(),
}))

const address = {
  toUserFriendlyAddress: () => 'NQ00 TEST LOCAL ADDRESS',
}

const stores = {
  app: reactive({ showHiddenTransactions: false }),
  featureFlags: reactive({ polygonRpcUrl: 'https://polygon.example' }),
  localWallet: reactive({ localAddress: address, localBalance: 100_000 }),
  locks: reactive({
    headChangePendingDrainLock: false,
    htlcCheckLock: false,
    headChangeUpdatesLock: false,
    isNetworkReconnecting: false,
    isProcessingRemote: false,
    isSendingTx: false,
    isSyncingWallets: false,
    isUpdatingTransactions: false,
  }),
  network: reactive({
    consensus: 'established',
    head: { hash: 'head-hash' },
    height: 123,
    peerCount: 3,
    client: {
      addTransactionListener: vi.fn(),
      getTransactionsByAddress: state.getTransactionsByAddress,
    },
    networkName: 'MainAlbatross',
    headTimestamp: 456,
  }),
  polygonUsdt: reactive({ isSendingPayment: false }),
  syncState: reactive({ walletContextGeneration: 0 }),
  remoteSigner: reactive({
    remoteAddress: address,
    remoteBalance: 0,
    start: 0,
    end: 0,
    isRemoteOk: false,
    isHtlcActive: false,
    hasHtlcExpired: false,
    remoteHeight: 0,
  }),
}

vi.mock('@capacitor/clipboard', () => ({
  Clipboard: { write: vi.fn() },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: state.isNativePlatform },
}))

vi.mock('@capgo/capacitor-updater', () => ({
  CapacitorUpdater: state.updater,
}))

vi.mock('pinia', async () => {
  const { isRef, ref } = await import('vue')
  return {
    storeToRefs: (store: Record<string, unknown>) => Object.fromEntries(
      Object.entries(store).map(([key, value]) => [key, isRef(value) ? value : ref(value)]),
    ),
  }
})

vi.mock('@ionic/vue', () => {
  const passthrough = (tag: string) => defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.())
    },
  })
  const IonButton = defineComponent({
    inheritAttrs: false,
    props: { disabled: Boolean },
    emits: ['click'],
    setup(props, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        disabled: props.disabled,
        onClick: () => emit('click'),
      }, slots.default?.())
    },
  })
  const IonInput = defineComponent({
    inheritAttrs: false,
    props: { disabled: Boolean, value: String },
    emits: ['ionInput'],
    setup(props, { attrs, emit }) {
      return () => h('input', {
        ...attrs,
        disabled: props.disabled,
        value: props.value,
        onInput: (event: Event) => emit('ionInput', {
          detail: { value: (event.target as HTMLInputElement).value },
        }),
      })
    },
  })

  return {
    alertController: {
      create: vi.fn(async (options: { message: string }) => {
        state.alertMessage = options.message
        return {
          present: vi.fn(),
          onDidDismiss: vi.fn(async () => ({ role: state.alertRole })),
        }
      }),
    },
    IonButton,
    IonCard: passthrough('section'),
    IonCardContent: passthrough('div'),
    IonCardHeader: passthrough('header'),
    IonCardTitle: passthrough('h2'),
    IonInput,
    IonItem: passthrough('div'),
    IonLabel: passthrough('label'),
    IonSegment: passthrough('div'),
    IonSegmentButton: passthrough('button'),
    IonSelect: passthrough('select'),
    IonSelectOption: passthrough('option'),
    IonToggle: passthrough('input'),
    toastController: {
      create: vi.fn(async () => ({ present: vi.fn() })),
    },
  }
})

vi.mock('vue-router', () => ({
  useRouter: () => ({ go: vi.fn() }),
}))

vi.mock('@/components/ModalTemplate.vue', () => ({
  default: defineComponent({
    setup(_, { slots }) {
      return () => h('main', slots.default?.())
    },
  }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/lib', () => ({
  isDev: true,
  isTestnet: false,
  networkOverride: null,
  setNetworkOverride: state.setNetworkOverride,
}))

vi.mock('@/lib/mock-mode', () => ({
  isMockBakedIn: false,
  isMockEnabled: false,
  setMockDataOverride: vi.fn(),
}))

vi.mock('@/lib/polygon/rpc-override', () => ({
  POLYGON_PUBLIC_RPCS: [],
  polygonRpcOverride: null,
  setPolygonRpcOverride: vi.fn(),
}))

vi.mock('@/lib/sql-queries', () => ({
  SQLQuery: {
    GetAllSwapQuotes: 'get-all-swap-quotes',
    PurgeRemoteSigners: 'purge-remote-signers',
    PurgeSwapHtlcs: 'purge-swap-htlcs',
    PurgeSwapQuotes: 'purge-swap-quotes',
  },
}))

vi.mock('@/stores/app', () => ({ useApp: () => stores.app }))
vi.mock('@/stores/conn', () => ({
  useConn: () => ({ query: state.query, run: state.run }),
}))
vi.mock('@/stores/feature-flags', () => ({ useFeatureFlags: () => stores.featureFlags }))
vi.mock('@/stores/local-wallet', () => ({ useLocalWallet: () => stores.localWallet }))
vi.mock('@/stores/locks', () => ({ useLocks: () => stores.locks }))
vi.mock('@/stores/nimiq-network', () => ({
  useNimiqNetwork: () => ({ ...stores.network, reconnect: vi.fn() }),
}))
vi.mock('@/stores/polygon-usdt', () => ({ usePolygonUsdt: () => stores.polygonUsdt }))
vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({
    ...stores.remoteSigner,
    discoverRemoteSignersFromBlockchain: state.discoverRemoteSignersFromBlockchain,
    purgeRemoteSigners: state.purgeRemoteSigners,
    validateRemoteSignerAddress: state.validateRemoteSignerAddress,
  }),
}))
vi.mock('@/stores/sync', () => ({
  MAX_MS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA: 1,
  useSync: () => ({
    recoverRemoteSigner: state.recoverRemoteSigner,
    verifyRemoteSignersDb: state.verifyRemoteSignersDb,
  }),
}))
vi.mock('@/stores/sync/state', () => ({ useSyncState: () => stores.syncState }))
vi.mock('@/stores/transactions', () => ({
  useTransactions: () => ({ clearTxHistory: state.clearTxHistory, sendTx: vi.fn() }),
}))
vi.mock('@/types/transactions', () => ({
  Transfer: {
    ExtendRemote: 'extend-remote',
    LocalToRemote: 'local-to-remote',
    RemoteToLocal: 'remote-to-local',
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const importable = {
  status: 'importable' as const,
  address: 'NQ22 TEST OLD HTLC ADDRESS',
  balance: 696_900_000,
  timeout: 999_500,
  expired: false,
  owner: 'NQ00 TEST LOCAL ADDRESS',
  cosignerRecipient: 'NQ99 COSIGNER ADDRESS',
  creationTransactionHash: 'creation-hash',
  creationState: 'confirmed' as const,
  signer: {},
}

async function mountModal() {
  const { default: DevModal } = await import('./DevModal.vue')
  const wrapper = mount(DevModal)
  await flushPromises()
  return wrapper
}

async function enterAddressAndValidate(wrapper: Awaited<ReturnType<typeof mountModal>>) {
  await wrapper.get('[data-testid="htlc-address"]').setValue(importable.address)
  await wrapper.get('[data-testid="htlc-validate"]').trigger('click')
  await flushPromises()
}

describe('dev modal HTLC recovery', () => {
  beforeEach(() => {
    state.alertMessage = ''
    state.alertRole = 'confirm'
    stores.syncState.walletContextGeneration = 0
    state.clearTxHistory.mockReset().mockResolvedValue(undefined)
    state.discoverRemoteSignersFromBlockchain.mockReset().mockResolvedValue({
      added: 0,
      alreadyKnown: 0,
      localComplete: true,
      errors: [],
      createdHtlcs: [],
      historyComplete: true,
    })
    state.getTransactionsByAddress.mockReset().mockResolvedValue([])
    state.purgeRemoteSigners.mockReset().mockResolvedValue(undefined)
    state.query.mockReset().mockResolvedValue([])
    state.recoverRemoteSigner.mockReset().mockResolvedValue({
      status: 'submitted',
      transactionHash: 'recovery-hash',
    })
    state.run.mockReset().mockResolvedValue(undefined)
    state.setNetworkOverride.mockReset()
    state.validateRemoteSignerAddress.mockReset().mockResolvedValue(importable)
    state.verifyRemoteSignersDb.mockReset().mockResolvedValue(undefined)
  })

  it('does not scan transaction history when the modal opens', async () => {
    await mountModal()

    expect(state.getTransactionsByAddress).not.toHaveBeenCalled()
    expect(state.discoverRemoteSignersFromBlockchain).not.toHaveBeenCalled()
  })

  it('shows progress and disables recovery controls during validation', async () => {
    const validation = deferred<typeof importable>()
    state.validateRemoteSignerAddress.mockReturnValueOnce(validation.promise)
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="htlc-address"]').setValue(importable.address)
    await wrapper.get('[data-testid="htlc-validate"]').trigger('click')

    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('Validating')
    expect(wrapper.get<HTMLButtonElement>('[data-testid="htlc-scan"]').element.disabled).toBe(true)
    expect(wrapper.get<HTMLButtonElement>('[data-testid="htlc-validate"]').element.disabled).toBe(true)

    validation.resolve(importable)
    await flushPromises()

    expect(wrapper.find('[data-testid="htlc-recover"]').exists()).toBe(true)
  })

  it('shows the recovery action only for a verified HTLC', async () => {
    const wrapper = await mountModal()
    await enterAddressAndValidate(wrapper)

    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('6969 NIM')
    expect(wrapper.find('[data-testid="htlc-recover"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="htlc-details"]').text()).toContain(importable.address)
    expect(wrapper.get('[data-testid="htlc-details"]').text()).toContain('999500')
    expect(wrapper.get('[data-testid="htlc-details"]').text()).toContain(importable.owner)
    expect(wrapper.get('[data-testid="htlc-details"]').text()).toContain(importable.cosignerRecipient)
    expect(wrapper.get('[data-testid="htlc-details"]').text()).toContain('confirmed')
    expect(wrapper.get('[data-testid="htlc-details"]').text()).toContain('importable')

    state.validateRemoteSignerAddress.mockResolvedValueOnce({
      status: 'invalid',
      reason: 'HTLC has no balance',
    })
    await wrapper.get('[data-testid="htlc-address"]').setValue('NQ23 EMPTY HTLC')
    await wrapper.get('[data-testid="htlc-validate"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('HTLC has no balance')
    expect(wrapper.find('[data-testid="htlc-recover"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="htlc-details"]').exists()).toBe(false)
  })

  it('offers targeted recovery for an already-known HTLC', async () => {
    const known = { ...importable, status: 'known' as const }
    state.validateRemoteSignerAddress.mockResolvedValueOnce(known)
    const wrapper = await mountModal()
    await enterAddressAndValidate(wrapper)

    expect(wrapper.get('[data-testid="htlc-details"]').text()).toContain('known')
    expect(wrapper.find('[data-testid="htlc-recover"]').exists()).toBe(true)

    await wrapper.get('[data-testid="htlc-recover"]').trigger('click')
    await flushPromises()

    expect(state.recoverRemoteSigner).toHaveBeenCalledWith(known)
    expect(state.verifyRemoteSignersDb).not.toHaveBeenCalled()
  })

  it('recovers only after confirmation without global reconciliation', async () => {
    const wrapper = await mountModal()
    await enterAddressAndValidate(wrapper)

    state.alertRole = 'cancel'
    await wrapper.get('[data-testid="htlc-recover"]').trigger('click')
    await flushPromises()
    expect(state.recoverRemoteSigner).not.toHaveBeenCalled()

    state.alertRole = 'confirm'
    await wrapper.get('[data-testid="htlc-recover"]').trigger('click')
    await flushPromises()

    expect(state.alertMessage).toBe('This HTLC belongs to this wallet and currently holds 6969 NIM. Nimiq Pay will register only this address and attempt one recovery transaction. If recovery cannot start safely, the signer will remain inactive for later reconciliation.')
    expect(state.recoverRemoteSigner).toHaveBeenCalledWith(importable)
    expect(state.verifyRemoteSignersDb).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="htlc-status"]').text()).toBe('Recovery transaction submitted for this HTLC.')
  })

  it.each([
    ['wallet-busy', 'HTLC registered. Recovery deferred: another transaction is unresolved.'],
    ['history-incomplete', 'HTLC registered. Recovery deferred: target transaction history is incomplete.'],
    ['outgoing-transaction', 'HTLC registered. Recovery deferred: an outgoing transaction already exists for this HTLC.'],
  ] as const)('maps %s recovery deferral and keeps target details visible', async (reason, message) => {
    state.recoverRemoteSigner.mockResolvedValueOnce({ status: 'deferred', reason })
    const wrapper = await mountModal()
    await enterAddressAndValidate(wrapper)

    await wrapper.get('[data-testid="htlc-recover"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="htlc-status"]').text()).toBe(message)
    expect(wrapper.get('[data-testid="htlc-details"]').text()).toContain(importable.address)
    expect(state.verifyRemoteSignersDb).not.toHaveBeenCalled()
  })

  it('warns not to retry an unknown recovery and keeps target details visible', async () => {
    state.recoverRemoteSigner.mockResolvedValueOnce({
      status: 'unknown',
      transactionHash: 'unknown-recovery-hash',
    })
    const wrapper = await mountModal()
    await enterAddressAndValidate(wrapper)

    await wrapper.get('[data-testid="htlc-recover"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="htlc-status"]').text()).toBe('Recovery outcome is unknown. The transaction remains pending; do not retry.')
    expect(wrapper.get('[data-testid="htlc-details"]').text()).toContain(importable.address)
    expect(state.verifyRemoteSignersDb).not.toHaveBeenCalled()
  })

  it('shows the returned rejection reason', async () => {
    state.recoverRemoteSigner.mockResolvedValueOnce({
      status: 'rejected',
      reason: 'Wallet or network unavailable',
    })
    const wrapper = await mountModal()
    await enterAddressAndValidate(wrapper)

    await wrapper.get('[data-testid="htlc-recover"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('Wallet or network unavailable')
    expect(state.verifyRemoteSignersDb).not.toHaveBeenCalled()
  })

  it('disables scan, input, validation, and recovery controls while recovering', async () => {
    const recovering = deferred<{ status: 'submitted', transactionHash: string }>()
    state.recoverRemoteSigner.mockReturnValueOnce(recovering.promise)
    const wrapper = await mountModal()
    await enterAddressAndValidate(wrapper)

    await wrapper.get('[data-testid="htlc-recover"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('Recovering')
    expect(wrapper.get<HTMLButtonElement>('[data-testid="htlc-scan"]').element.disabled).toBe(true)
    expect(wrapper.get<HTMLInputElement>('[data-testid="htlc-address"]').element.disabled).toBe(true)
    expect(wrapper.get<HTMLButtonElement>('[data-testid="htlc-validate"]').element.disabled).toBe(true)
    expect(wrapper.get<HTMLButtonElement>('[data-testid="htlc-recover"]').element.disabled).toBe(true)

    recovering.resolve({ status: 'submitted', transactionHash: 'recovery-hash' })
    await flushPromises()
    expect(state.verifyRemoteSignersDb).not.toHaveBeenCalled()
  })

  it('invalidates wallet context before queued signer purge on network switch', async () => {
    state.purgeRemoteSigners.mockImplementationOnce(async () => {
      expect(stores.syncState.walletContextGeneration).toBe(1)
    })
    const wrapper = await mountModal()
    const segment = wrapper.findAll('div').find(node => node.attributes('value') === 'default')
    if (!segment)
      throw new Error('Network segment not found')

    await segment.trigger('ion-change', { detail: { value: 'testnet' } })
    await flushPromises()

    expect(state.purgeRemoteSigners).toHaveBeenCalledOnce()
    expect(state.run).not.toHaveBeenCalledWith('purge-remote-signers')
    expect(state.setNetworkOverride).toHaveBeenCalledWith('testnet')
  })

  it('runs the bounded automatic scan only on demand', async () => {
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="htlc-scan"]').trigger('click')
    await flushPromises()

    expect(state.discoverRemoteSignersFromBlockchain).toHaveBeenCalledOnce()
    expect(state.verifyRemoteSignersDb).toHaveBeenCalledWith({
      discoveryResult: { added: 0, alreadyKnown: 0, localComplete: true, errors: [], createdHtlcs: [], historyComplete: true },
    })
    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('Scan complete')
  })

  it('preserves incomplete scan results for reconciliation and displays the failure', async () => {
    const discoveryResult = {
      added: 1,
      alreadyKnown: 0,
      localComplete: false,
      errors: ['Local history lookup timed out'],
      createdHtlcs: [],
      historyComplete: false,
    }
    state.discoverRemoteSignersFromBlockchain.mockResolvedValueOnce(discoveryResult)
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="htlc-scan"]').trigger('click')
    await flushPromises()

    expect(state.verifyRemoteSignersDb).toHaveBeenCalledWith({ discoveryResult })
    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('History scan was incomplete')
    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('Local history lookup timed out')
    expect(wrapper.get<HTMLButtonElement>('[data-testid="htlc-scan"]').element.disabled).toBe(false)
  })
})

describe('dev modal OTA update', () => {
  const latest = {
    version: '2.23.1',
    url: 'https://updates.example/bundles/2.23.1.zip',
    sessionKey: 'session-key',
    checksum: 'checksum',
  }
  const bundle = { id: 'bundle-id', version: '2.23.1', status: 'pending' }
  const removeListener = vi.fn()
  let onDownloadProgress: (event: { percent: number, bundle: { version: string } }) => void

  async function check(wrapper: Awaited<ReturnType<typeof mountModal>>) {
    await wrapper.get('[data-testid="ota-check"]').trigger('click')
    await flushPromises()
  }

  beforeEach(() => {
    stores.locks.isSendingTx = false
    stores.locks.isProcessingRemote = false
    stores.locks.htlcCheckLock = false
    stores.polygonUsdt.isSendingPayment = false
    state.query.mockReset().mockResolvedValue([])
    state.isNativePlatform.mockReset().mockReturnValue(true)
    removeListener.mockReset().mockResolvedValue(undefined)
    state.updater.addListener.mockReset().mockImplementation(async (_event, listener) => {
      onDownloadProgress = listener
      return { remove: removeListener }
    })
    state.updater.current.mockReset().mockResolvedValue({ bundle: { version: 'builtin' }, native: '2.23.0' })
    state.updater.download.mockReset().mockResolvedValue(bundle)
    state.updater.getLatest.mockReset().mockResolvedValue(latest)
    state.updater.list.mockReset().mockResolvedValue({ bundles: [] })
    state.updater.next.mockReset().mockResolvedValue(bundle)
    state.updater.set.mockReset().mockResolvedValue(undefined)
  })

  it('hides the card on web, where OTA does not exist', async () => {
    state.isNativePlatform.mockReturnValue(false)
    const wrapper = await mountModal()

    expect(wrapper.find('[data-testid="ota-check"]').exists()).toBe(false)
  })

  it('shows the running bundle and does not contact the server on open', async () => {
    const wrapper = await mountModal()

    expect(wrapper.get('[data-testid="ota-current"]').text()).toBe('Running: builtin on native 2.23.0')
    expect(state.updater.getLatest).not.toHaveBeenCalled()
  })

  // Rejection is what the production server produces: it sends `error` without `kind`.
  it('treats the no-update rejection as a normal result, not an error', async () => {
    state.updater.getLatest.mockRejectedValueOnce(new Error('no_new_version_available'))
    const wrapper = await mountModal()
    await check(wrapper)

    expect(wrapper.get('[data-testid="ota-status"]').text()).toBe('No update available for this build.')
    expect(wrapper.find('[data-testid="ota-download"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ota-install"]').exists()).toBe(false)
  })

  it('shows a resolved response without a url as no update', async () => {
    state.updater.getLatest.mockResolvedValueOnce({ version: 'builtin', kind: 'up_to_date' })
    const wrapper = await mountModal()
    await check(wrapper)

    expect(wrapper.get('[data-testid="ota-status"]').text()).toBe('No update available for this build.')
    expect(wrapper.find('[data-testid="ota-download"]').exists()).toBe(false)
  })

  it('shows a failed check and allows retrying', async () => {
    state.updater.getLatest.mockRejectedValueOnce(new Error('Network down'))
    const wrapper = await mountModal()
    await check(wrapper)

    expect(wrapper.get('[data-testid="ota-status"]').text()).toBe('Network down')
    expect(wrapper.get<HTMLButtonElement>('[data-testid="ota-check"]').element.disabled).toBe(false)
  })

  it('downloads with the encrypted bundle details and waits for the restart tap', async () => {
    const wrapper = await mountModal()
    await check(wrapper)
    await wrapper.get('[data-testid="ota-download"]').trigger('click')
    await flushPromises()

    expect(state.updater.download).toHaveBeenCalledWith(latest)
    expect(removeListener).toHaveBeenCalledOnce()
    expect(state.updater.set).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="ota-download"]').exists()).toBe(false)

    await wrapper.get('[data-testid="ota-install"]').trigger('click')
    await flushPromises()

    expect(state.updater.next).toHaveBeenCalledWith({ id: 'bundle-id' })
    expect(state.updater.set).toHaveBeenCalledWith({ id: 'bundle-id' })
    expect(state.updater.next.mock.invocationCallOrder[0]).toBeLessThan(state.updater.set.mock.invocationCallOrder[0]!)
  })

  it('reports progress for this version only and removes the listener on failure', async () => {
    let failDownload!: (error: Error) => void
    state.updater.download.mockReturnValueOnce(new Promise((_, reject) => {
      failDownload = reject
    }))
    const wrapper = await mountModal()
    await check(wrapper)
    await wrapper.get('[data-testid="ota-download"]').trigger('click')
    await flushPromises()

    onDownloadProgress({ percent: 40, bundle: { version: '2.23.1' } })
    await flushPromises()
    expect(wrapper.get('[data-testid="ota-status"]').text()).toBe('Downloading 2.23.1: 40%')

    onDownloadProgress({ percent: 90, bundle: { version: '9.9.9' } })
    await flushPromises()
    expect(wrapper.get('[data-testid="ota-status"]').text()).toBe('Downloading 2.23.1: 40%')

    failDownload(new Error('Checksum mismatch'))
    await flushPromises()

    expect(wrapper.get('[data-testid="ota-status"]').text()).toBe('Checksum mismatch')
    expect(removeListener).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid="ota-install"]').exists()).toBe(false)
    expect(wrapper.get<HTMLButtonElement>('[data-testid="ota-download"]').element.disabled).toBe(false)
  })

  it.each(['pending', 'success'])('reuses a %s bundle of the same version without downloading', async (status) => {
    state.updater.list.mockResolvedValueOnce({ bundles: [{ ...bundle, status }] })
    const wrapper = await mountModal()
    await check(wrapper)

    expect(wrapper.find('[data-testid="ota-download"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ota-install"]').exists()).toBe(true)
    expect(state.updater.download).not.toHaveBeenCalled()
  })

  it.each(['error', 'downloading'])('does not install a bundle with status %s', async (status) => {
    state.updater.list.mockResolvedValueOnce({ bundles: [{ ...bundle, status }] })
    const wrapper = await mountModal()
    await check(wrapper)

    expect(wrapper.find('[data-testid="ota-download"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ota-install"]').exists()).toBe(false)
  })

  it.each(['isSendingTx', 'isProcessingRemote', 'htlcCheckLock'] as const)('blocks the restart while %s', async (lock) => {
    state.updater.list.mockResolvedValueOnce({ bundles: [bundle] })
    stores.locks[lock] = true
    const wrapper = await mountModal()
    await check(wrapper)

    expect(wrapper.get<HTMLButtonElement>('[data-testid="ota-install"]').element.disabled).toBe(true)
    expect(wrapper.find('[data-testid="ota-wait"]').exists()).toBe(true)
  })

  it('blocks the restart while a USDT payment is sending', async () => {
    state.updater.list.mockResolvedValueOnce({ bundles: [bundle] })
    stores.polygonUsdt.isSendingPayment = true
    const wrapper = await mountModal()
    await check(wrapper)

    expect(wrapper.get<HTMLButtonElement>('[data-testid="ota-install"]').element.disabled).toBe(true)
    expect(wrapper.find('[data-testid="ota-wait"]').exists()).toBe(true)
  })

  it('shows a failed install and allows retrying', async () => {
    state.updater.list.mockResolvedValueOnce({ bundles: [bundle] })
    state.updater.set.mockRejectedValueOnce(new Error('No index.html'))
    const wrapper = await mountModal()
    await check(wrapper)
    await wrapper.get('[data-testid="ota-install"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="ota-status"]').text()).toBe('No index.html')
    expect(wrapper.get<HTMLButtonElement>('[data-testid="ota-install"]').element.disabled).toBe(false)
  })
})
