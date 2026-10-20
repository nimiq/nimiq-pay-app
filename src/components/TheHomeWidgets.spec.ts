import type { WidgetView } from '@/stores/mini-app-widgets'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const visibility = await vi.hoisted(async () => (await import('vue')).ref<'visible' | 'hidden'>('visible'))
const { background, launchMiniApp, showModal, store, visible } = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return {
    launchMiniApp: vi.fn(),
    showModal: vi.fn(),
    visible: ref(true),
    background: ref(false),
    store: { ready: ref(true), views: ref<WidgetView[]>([]), tick: vi.fn(), setSize: vi.fn(), remove: vi.fn() },
  }
})

vi.mock('@/stores/mini-app-widgets', () => ({ TICK_MS: 15_000, useMiniAppWidgets: () => store }))
vi.mock('@/stores/locks', () => ({ useLocks: () => ({ isHomeVisible: visible, isAppInBackground: background }) }))
vi.mock('@vueuse/core', async o => ({ ...await o<object>(), useDocumentVisibility: () => visibility }))
vi.mock('@/stores/app', () => ({ useApp: () => ({ language: 'en', selectedFiat: 'EUR' }) }))
vi.mock('@/stores/mini-apps', () => ({ useMiniApps: () => ({ getMiniAppReportUrl: () => undefined }) }))
vi.mock('@/lib/mini-app-launcher', () => ({ launchMiniApp }))
vi.mock('@/composables/useModal', () => ({ Modal: { MiniApps: 'MiniApps' }, useModal: () => ({ showModal }) }))

const { default: TheHomeWidgets } = await import('./TheHomeWidgets.vue')

function view(size: WidgetView['size'], widgetId: string = size): WidgetView {
  return { key: `https://swap.example/#${widgetId}`, scope: 'https://swap.example/', widgetId, appName: 'Swap', appIcon: '', size, sizes: ['small', 'medium'], value: { kind: 'text', text: 'Start a swap' }, tone: 'neutral', rows: [], url: 'https://swap.example/?swap=1', appAddress: 'swap.example', launchTitle: 'Swap' }
}

const mounted: Array<{ unmount: () => void }> = []

function render() {
  const wrapper = mount(TheHomeWidgets, { global: { mocks: { $t: (m: string) => m }, stubs: { MiniAppActionsSheet: true } } })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  visible.value = true
  background.value = false
  visibility.value = 'visible'
  store.ready.value = true
  store.views.value = []
})

afterEach(() => {
  mounted.splice(0).forEach(w => w.unmount())
  vi.useRealTimers()
})

describe('theHomeWidgets', () => {
  it('offers the gallery while Home has no widgets', async () => {
    const wrapper = render()
    expect(wrapper.find('[data-testid="home-widgets"]').exists()).toBe(false)
    await wrapper.find('[data-testid="home-widgets-add-empty"]').trigger('click')
    expect(showModal).toHaveBeenCalledWith('MiniApps', expect.objectContaining({ componentProps: { initialStep: 'widgets' }, analytics: expect.objectContaining({ source: 'home_widgets_empty' }) }))
  })

  it('waits for the stored widgets before offering the gallery', () => {
    store.ready.value = false
    expect(render().find('[data-testid="home-widgets-add-empty"]').exists()).toBe(false)
  })

  it('lays widgets out by size', () => {
    store.views.value = [view('icon'), view('small'), view('large')]
    const classes = render().findAll('[data-testid^="mini-app-widget-"]').map(w => w.classes())
    expect(classes[0]).toContain('col-span-1')
    expect(classes[1]).toContain('col-span-2')
    expect(classes[2]).toContain('col-span-4')
  })

  it('ticks while Home is visible and stops when it is not', async () => {
    store.views.value = [view('small')]
    render()
    expect(store.tick).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(15_000)
    expect(store.tick).toHaveBeenCalledTimes(2)
    visible.value = false
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.tick).toHaveBeenCalledTimes(2)
  })

  it('keeps the document order and a plain four-column grid', () => {
    store.views.value = [view('small'), view('large'), view('icon')]
    const wrapper = render()
    const grid = wrapper.find('[data-testid="home-widgets"] > div:nth-child(2)')
    expect(grid.classes()).toEqual(expect.arrayContaining(['grid', 'grid-cols-4']))
    expect(grid.classes()).not.toContain('grid-flow-row-dense')
    expect(wrapper.findAll('[data-testid^="mini-app-widget-"]').map(w => w.classes().find(c => c.startsWith('col-span-')))).toEqual(['col-span-2', 'col-span-4', 'col-span-1'])
  })

  it('does not tick without widgets, in a hidden document or with the app in the background', async () => {
    store.views.value = [view('small')]
    render()
    expect(store.tick).toHaveBeenCalledTimes(1)
    visibility.value = 'hidden'
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.tick).toHaveBeenCalledTimes(1)
    visibility.value = 'visible'
    background.value = true
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.tick).toHaveBeenCalledTimes(1)
    store.tick.mockClear()
    background.value = false
    store.views.value = []
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.tick).not.toHaveBeenCalled()
  })

  it('opens the menu sheet from a widget', async () => {
    store.views.value = [view('small')]
    const wrapper = render()
    await wrapper.find('[data-testid="widget-menu"]').trigger('click')
    expect(wrapper.findComponent({ name: 'MiniAppActionsSheet' }).props('open')).toBe(true)
  })

  it('launches under the catalog name or address, never a declared name', async () => {
    store.views.value = [{ ...view('small'), appName: 'SwapSpace', launchTitle: 'swap.example' }]
    await render().find('[data-testid="widget-open"]').trigger('click')
    expect(launchMiniApp).toHaveBeenCalledWith(expect.objectContaining({ title: 'swap.example' }))
  })

  it('opens the Mini App at the widget URL', async () => {
    store.views.value = [view('small')]
    await render().find('[data-testid="widget-open"]').trigger('click')
    expect(launchMiniApp).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://swap.example/?swap=1', title: 'Swap', source: 'home_widget' }))
  })

  it('changes the size and removes the widget from its menu', async () => {
    store.views.value = [view('small', 'swap')]
    const wrapper = render()
    await wrapper.find('[data-testid="widget-menu"]').trigger('click')
    const sheet = wrapper.findComponent({ name: 'MiniAppActionsSheet' })
    expect(sheet.props('context')).toMatchObject({ app: { name: 'Swap', url: 'https://swap.example/' }, address: 'swap.example', widget: { size: 'small', sizes: ['small', 'medium'] } })
    sheet.vm.$emit('size', 'medium')
    sheet.vm.$emit('removeWidget')
    expect(store.setSize).toHaveBeenCalledWith('https://swap.example/', 'swap', 'medium')
    expect(store.remove).toHaveBeenCalledWith('https://swap.example/', 'swap')
  })

  it('opens the gallery from Add', async () => {
    store.views.value = [view('small')]
    const wrapper = render()
    expect(wrapper.find('[data-testid="home-widgets-add-empty"]').exists()).toBe(false)
    await wrapper.find('[data-testid="home-widgets-add"]').trigger('click')
    expect(showModal).toHaveBeenCalledWith('MiniApps', expect.objectContaining({ componentProps: { initialStep: 'widgets' }, analytics: expect.objectContaining({ source: 'home_widgets' }) }))
  })
})
