import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'

const state = vi.hoisted(() => ({
  alertMessage: '',
  alertRole: 'confirm',
  clearTxHistory: vi.fn(),
  discoverRemoteSignersFromBlockchain: vi.fn(),
  listCosignerHtlcs: vi.fn(),
  getTransactionsByAddress: vi.fn(),
  purgeRemoteSigners: vi.fn(),
  query: vi.fn(),
  recoverRemoteSigner: vi.fn(),
  run: vi.fn(),
  setNetworkOverride: vi.fn(),
  validateRemoteSignerAddress: vi.fn(),
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
vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({
    ...stores.remoteSigner,
    discoverRemoteSignersFromBlockchain: state.discoverRemoteSignersFromBlockchain,
    listCosignerHtlcs: state.listCosignerHtlcs,
    purgeRemoteSigners: state.purgeRemoteSigners,
    validateRemoteSignerAddress: state.validateRemoteSignerAddress,
  }),
}))
vi.mock('@/stores/sync', () => ({
  MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA: 1,
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
    state.listCosignerHtlcs.mockReset().mockResolvedValue([])
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
      forceCosignerListing: true,
    })
    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('Scan complete')
  })

  it('asks the cosigner before the chain scan and shows how many HTLCs it listed', async () => {
    let finishDiscovery = () => {}
    state.discoverRemoteSignersFromBlockchain.mockReturnValueOnce(new Promise((resolve) => {
      finishDiscovery = () => resolve({ added: 0, alreadyKnown: 0, localComplete: false, errors: [], createdHtlcs: [], historyComplete: false })
    }))
    state.listCosignerHtlcs.mockResolvedValue(['NQ33 TEST LISTED HTLC', 'NQ34 TEST LISTED HTLC'])
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="htlc-scan"]').trigger('click')
    expect(state.listCosignerHtlcs).toHaveBeenCalledOnce()
    finishDiscovery()
    await flushPromises()

    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('2 listed by the cosigner')
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

    expect(state.verifyRemoteSignersDb).toHaveBeenCalledWith({ discoveryResult, forceCosignerListing: true })
    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('History scan was incomplete')
    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('Local history lookup timed out')
    expect(wrapper.get<HTMLButtonElement>('[data-testid="htlc-scan"]').element.disabled).toBe(false)
  })
})
