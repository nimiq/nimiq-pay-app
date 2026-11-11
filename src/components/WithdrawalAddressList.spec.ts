import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

const withdrawalAddressesHistory = ref([
  { address: 'NQ11 AAAA' },
  { address: '0xbbbb' },
])
const isNimiqAsset = ref(true)

vi.mock('@ionic/vue', () => ({
  IonButton: defineComponent({ template: '<button class="add-address"><slot /></button>' }),
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({ withdrawalAddressesHistory, isNimiqAsset, setAddressAlias: vi.fn() }),
}))

vi.mock('pinia', () => ({
  storeToRefs: (store: object) => store,
}))

vi.mock('@/lib/flows', () => ({ initializeFlow: vi.fn() }))
vi.mock('@/lib/flows/steps.types', () => ({ FlowName: {}, stepEmits: ['done'] }))

vi.mock('@/components/ShortAddressDisplay.vue', () => ({
  default: defineComponent({
    props: { address: { type: String, required: true } },
    template: '<span class="address">{{ address }}</span>',
  }),
}))

const iconStub = { default: defineComponent({ template: '<span />' }) }
vi.mock('@/components/icons/pen.vue', () => iconStub)
vi.mock('@/components/icons/remove.vue', () => iconStub)

async function mountList(props: { manage?: boolean } = {}) {
  const { default: WithdrawalAddressList } = await import('./WithdrawalAddressList.vue')
  return mount(WithdrawalAddressList, { props, global: { mocks: { $t: (s: string) => s } } })
}

describe('withdrawalAddressList', () => {
  beforeEach(() => {
    isNimiqAsset.value = true
  })

  it('in a flow, lists only the active asset, selects on tap, and offers to add', async () => {
    const wrapper = await mountList()
    const addresses = wrapper.findAll('.address')
    expect(addresses.map(a => a.text())).toEqual(['NQ11 AAAA'])

    await addresses[0]!.trigger('click')
    expect(wrapper.emitted('done')).toEqual([['NQ11 AAAA']])
    expect(wrapper.find('.add-address').exists()).toBe(true)
  })

  it('in manage mode, lists every asset, does not select, and hides add', async () => {
    const wrapper = await mountList({ manage: true })
    const addresses = wrapper.findAll('.address')
    expect(addresses.map(a => a.text())).toEqual(['0xbbbb', 'NQ11 AAAA'])

    await addresses[0]!.trigger('click')
    expect(wrapper.emitted('done')).toBeUndefined()
    expect(wrapper.find('.add-address').exists()).toBe(false)
  })
})
