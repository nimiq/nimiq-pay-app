import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'

const state = vi.hoisted(() => ({
  alertMessage: '',
  alertRole: 'confirm',
  discoverRemoteSignersFromBlockchain: vi.fn(),
  getTransactionsByAddress: vi.fn(),
  importValidatedRemoteSigner: vi.fn(),
  query: vi.fn(),
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
  setNetworkOverride: vi.fn(),
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
  useConn: () => ({ query: state.query, run: vi.fn() }),
}))
vi.mock('@/stores/feature-flags', () => ({ useFeatureFlags: () => stores.featureFlags }))
vi.mock('@/stores/local-wallet', () => ({ useLocalWallet: () => stores.localWallet }))
vi.mock('@/stores/locks', () => ({ useLocks: () => stores.locks }))
vi.mock('@/stores/naka', () => ({
  useNaka: () => ({ deactivateCardOnDevice: vi.fn(), card: undefined }),
  useNakaDb: () => ({ purgeNakaCards: vi.fn() }),
}))
vi.mock('@/stores/nimiq-network', () => ({
  useNimiqNetwork: () => ({ ...stores.network, reconnect: vi.fn() }),
}))
vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({
    ...stores.remoteSigner,
    discoverRemoteSignersFromBlockchain: state.discoverRemoteSignersFromBlockchain,
    importValidatedRemoteSigner: state.importValidatedRemoteSigner,
    validateRemoteSignerAddress: state.validateRemoteSignerAddress,
  }),
}))
vi.mock('@/stores/sync', () => ({
  MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA: 1,
  useSync: () => ({ verifyRemoteSignersDb: state.verifyRemoteSignersDb }),
}))
vi.mock('@/stores/transactions', () => ({
  useTransactions: () => ({ clearTxHistory: vi.fn(), sendTx: vi.fn() }),
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
    state.discoverRemoteSignersFromBlockchain.mockReset().mockResolvedValue({
      added: 0,
      alreadyKnown: 0,
      localComplete: true,
      errors: [],
    })
    state.getTransactionsByAddress.mockReset().mockResolvedValue([])
    state.importValidatedRemoteSigner.mockReset().mockResolvedValue('added')
    state.query.mockReset().mockResolvedValue([])
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

    expect(wrapper.find('[data-testid="htlc-add"]').exists()).toBe(true)
  })

  it('shows the add action only for a verified importable HTLC', async () => {
    const wrapper = await mountModal()
    await enterAddressAndValidate(wrapper)

    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('6969 NIM')
    expect(wrapper.find('[data-testid="htlc-add"]').exists()).toBe(true)
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
    expect(wrapper.find('[data-testid="htlc-add"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="htlc-details"]').exists()).toBe(false)
  })

  it('shows known HTLC details without an add action', async () => {
    state.validateRemoteSignerAddress.mockResolvedValueOnce({ ...importable, status: 'known' })
    const wrapper = await mountModal()
    await enterAddressAndValidate(wrapper)

    expect(wrapper.get('[data-testid="htlc-details"]').text()).toContain('known')
    expect(wrapper.find('[data-testid="htlc-add"]').exists()).toBe(false)
  })

  it('imports only after confirmation and immediately reconciles wallets', async () => {
    const wrapper = await mountModal()
    await enterAddressAndValidate(wrapper)

    state.alertRole = 'cancel'
    await wrapper.get('[data-testid="htlc-add"]').trigger('click')
    await flushPromises()
    expect(state.importValidatedRemoteSigner).not.toHaveBeenCalled()

    state.alertRole = 'confirm'
    await wrapper.get('[data-testid="htlc-add"]').trigger('click')
    await flushPromises()

    expect(state.alertMessage).toBe('This HTLC belongs to this wallet and currently holds 6969 NIM. Adding it does not move funds immediately, but wallet reconciliation may automatically reclaim it.')
    expect(state.importValidatedRemoteSigner).toHaveBeenCalledWith(importable)
    expect(state.verifyRemoteSignersDb).toHaveBeenCalledWith({ skipDiscovery: true })
    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('added')
  })

  it('disables recovery controls while importing', async () => {
    const importing = deferred<'added'>()
    state.importValidatedRemoteSigner.mockReturnValueOnce(importing.promise)
    const wrapper = await mountModal()
    await enterAddressAndValidate(wrapper)

    await wrapper.get('[data-testid="htlc-add"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('Adding')
    expect(wrapper.get<HTMLButtonElement>('[data-testid="htlc-scan"]').element.disabled).toBe(true)
    expect(wrapper.get<HTMLInputElement>('[data-testid="htlc-address"]').element.disabled).toBe(true)
    expect(wrapper.get<HTMLButtonElement>('[data-testid="htlc-validate"]').element.disabled).toBe(true)
    expect(wrapper.get<HTMLButtonElement>('[data-testid="htlc-add"]').element.disabled).toBe(true)

    importing.resolve('added')
    await flushPromises()
    expect(state.verifyRemoteSignersDb).toHaveBeenCalledWith({ skipDiscovery: true })
  })

  it('runs the bounded automatic scan only on demand', async () => {
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="htlc-scan"]').trigger('click')
    await flushPromises()

    expect(state.discoverRemoteSignersFromBlockchain).toHaveBeenCalledOnce()
    expect(state.verifyRemoteSignersDb).toHaveBeenCalledWith({ skipDiscovery: true })
    expect(wrapper.get('[data-testid="htlc-status"]').text()).toContain('Scan complete')
  })
})
