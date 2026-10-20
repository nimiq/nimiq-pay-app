import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import TheHomeTransactions from './TheHomeTransactions.vue'

const state = vi.hoisted(() => ({
  transactions: [] as { hash: string, timestamp: number }[],
  loadMoreTxs: vi.fn(async () => 0),
  canLoadMore: vi.fn(() => false),
}))

function passthrough(tag: string) {
  return defineComponent({ setup: (_, { slots }) => () => h(tag, slots.default?.()) })
}

vi.mock('motion-v', () => ({ motion: { ol: passthrough('ol'), li: passthrough('li') } }))
vi.mock('@vueuse/components', () => ({ vOnLongPress: {} }))
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn() }, ImpactStyle: { Medium: 'MEDIUM' } }))
vi.mock('@ionic/vue', () => ({
  alertController: { create: vi.fn() },
  IonInfiniteScroll: defineComponent({
    name: 'IonInfiniteScroll',
    props: { disabled: Boolean },
    emits: ['ionInfinite'],
    setup: (props, { slots }) => () => h('div', { 'data-testid': 'infinite', 'data-disabled': String(props.disabled) }, slots.default?.()),
  }),
  IonInfiniteScrollContent: passthrough('div'),
  IonSkeletonText: passthrough('div'),
}))
vi.mock('@/components/TransactionItem.vue', () => ({
  default: defineComponent({ props: { tx: Object }, setup: props => () => h('div', { 'data-testid': 'tx' }, (props.tx as { hash: string }).hash) }),
}))
vi.mock('@/components/TestnetFaucet.vue', () => ({ default: passthrough('div') }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (key: string) => key } }))
vi.mock('@/lib', () => ({ debounceDelay: 0, debounceMaxWait: 0, isTestnet: false }))
vi.mock('@/lib/flows', () => ({ initializeFlow: vi.fn() }))
vi.mock('@/lib/flows/steps.types', () => ({ FlowName: {} }))
vi.mock('@/stores/app', () => ({ useApp: defineStore('app', () => ({ showAnimations: ref(false), isNimiqAsset: ref(true), activeAsset: ref('NIM') })) }))
vi.mock('@/stores/locks', () => ({ useLocks: defineStore('locks', () => ({ isUpdatingTransactions: ref(false), isConsensusNeeded: ref(false) })) }))
vi.mock('@/stores/nimiq-network', () => ({ useNimiqNetwork: defineStore('nimiq-network', () => ({ consensus: ref('established') })) }))
vi.mock('@/stores/polygon-usdt', () => ({ usePolygonUsdt: defineStore('polygon-usdt', () => ({ hasLoadedHistory: ref(true) })) }))
vi.mock('@/stores/local-wallet', () => ({ useLocalWallet: defineStore('local-wallet', () => ({ localAddress: ref({ toUserFriendlyAddress: () => 'NQ00 LOCAL' }), localBalance: ref(1) })) }))
vi.mock('@/stores/remote-signer', () => ({ useRemoteSigner: defineStore('remote-signer', () => ({ remoteBalance: ref(1) })) }))
vi.mock('@/stores/transactions', () => ({
  useTransactions: defineStore('transactions', () => ({
    transactionsToShow: ref(state.transactions),
    loadMoreTxs: state.loadMoreTxs,
    canLoadMore: state.canLoadMore,
    setTxHidden: vi.fn(),
  })),
}))

function createTransactions(count: number) {
  return Array.from({ length: count }, (_, index) => ({ hash: `tx-${index}`, timestamp: count - index }))
}

async function scrollToEnd(wrapper: ReturnType<typeof mount>) {
  const complete = vi.fn()
  wrapper.findComponent({ name: 'IonInfiniteScroll' }).vm.$emit('ionInfinite', { target: { complete } })
  await flushPromises()
  expect(complete).toHaveBeenCalledOnce()
}

describe('theHomeTransactions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    state.loadMoreTxs.mockReset().mockResolvedValue(0)
    state.canLoadMore.mockReset().mockReturnValue(false)
  })

  it('renders only the first page of a long history', () => {
    state.transactions.splice(0, state.transactions.length, ...createTransactions(100))
    const wrapper = mount(TheHomeTransactions)

    expect(wrapper.findAll('[data-testid="tx"]')).toHaveLength(30)
    expect(wrapper.find('[data-testid="infinite"]').attributes('data-disabled')).toBe('false')
  })

  it('renders the next page from memory when scrolled to the end', async () => {
    state.transactions.splice(0, state.transactions.length, ...createTransactions(100))
    const wrapper = mount(TheHomeTransactions)

    await scrollToEnd(wrapper)

    expect(wrapper.findAll('[data-testid="tx"]')).toHaveLength(60)
    expect(state.loadMoreTxs).not.toHaveBeenCalled()
  })

  it('loads from the database once every row in memory is rendered', async () => {
    state.transactions.splice(0, state.transactions.length, ...createTransactions(30))
    state.canLoadMore.mockReturnValue(true)
    const wrapper = mount(TheHomeTransactions)

    await scrollToEnd(wrapper)

    expect(state.loadMoreTxs).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid="infinite"]').attributes('data-disabled')).toBe('true')
  })
})
