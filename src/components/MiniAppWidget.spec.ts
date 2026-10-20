import type { WidgetView } from '@/stores/mini-app-widgets'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MiniAppWidget from './MiniAppWidget.vue'

vi.mock('@/stores/app', () => ({ useApp: () => ({ language: 'en' }) }))

function view(extra: Partial<WidgetView> = {}): WidgetView {
  return {
    key: 'https://swap.example/#swap',
    scope: 'https://swap.example/',
    widgetId: 'swap',
    appName: 'Swap',
    appIcon: 'https://swap.example/icon.png',
    size: 'small',
    sizes: ['small', 'medium', 'large', 'icon'],
    label: 'Waiting for your deposit',
    value: { kind: 'amount', amount: '0.05', currency: 'ETH' },
    info: { kind: 'text', text: 'for about 1,234 NIM' },
    tone: 'attention',
    progress: 0.25,
    countdown: { label: 'Deposit window', until: Date.now() + 23.5 * 60_000 },
    rows: [{ label: 'You send', value: { kind: 'amount', amount: '0.05', currency: 'ETH' } }, { label: 'Order', value: { kind: 'text', text: '#12' }, url: 'https://swap.example/orders/12' }],
    chart: { kind: 'line', points: [1, 3, 2] },
    url: 'https://swap.example/?swap=abc',
    launchTitle: 'Swap',
    ...extra,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

function render(props: { view: WidgetView, preview?: boolean }) {
  return mount(MiniAppWidget, { props, global: { mocks: { $t: (m: string, p?: Record<string, string>) => p ? m.replace(/\{(\w+)\}/g, (_, k: string) => p[k]!) : m } } })
}

function click(element: Element, detail: number) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }))
}

describe('miniAppWidget', () => {
  it('shows label, value and info on small, without the medium and large extras', () => {
    const text = render({ view: view() }).text()
    expect(text).toContain('Swap')
    expect(text).toContain('Waiting for your deposit')
    expect(text).toContain('0.05 ETH')
    expect(text).toContain('for about 1,234 NIM')
    expect(text).not.toContain('23 min')
    expect(text).not.toContain('You send')
  })

  it('adds the countdown and the progress bar on medium', () => {
    const wrapper = render({ view: view({ size: 'medium' }) })
    expect(wrapper.text()).toContain('Deposit window')
    expect(wrapper.text()).toContain('23 min')
    expect(wrapper.find('[data-testid="widget-progress"]').attributes('style')).toContain('width: 25%')
    expect(wrapper.text()).not.toContain('You send')
  })

  it('adds rows on large, and a row with a link opens it', async () => {
    const wrapper = render({ view: view({ size: 'large' }) })
    expect(wrapper.text()).toContain('You send')
    expect(wrapper.find('[data-testid="widget-chart"]').exists()).toBe(false)
    await wrapper.find('[data-testid="widget-row-link"]').trigger('click')
    expect(wrapper.emitted('open')).toEqual([['https://swap.example/orders/12']])
  })

  it('draws the chart on large when there are no rows', () => {
    expect(render({ view: view({ size: 'large', rows: [] }) }).find('[data-testid="widget-chart"] polyline').exists()).toBe(true)
    expect(render({ view: view({ size: 'large', rows: [], chart: { kind: 'bars', points: [1, 2] } }) }).findAll('[data-testid="widget-chart"] rect')).toHaveLength(2)
  })

  it('shows only the icon, the name and the tone dot on icon', () => {
    const wrapper = render({ view: view({ size: 'icon' }) })
    expect(wrapper.text()).toBe('Swap')
    expect(wrapper.find('.bg-pumpkin').exists()).toBe(true)
  })

  it('formats fiat as money, crypto with its ticker, and changes with a sign and colour', () => {
    expect(render({ view: view({ value: { kind: 'amount', amount: '0.000317', currency: 'EUR' } }) }).text()).toContain('€0.000317')
    expect(render({ view: view({ value: { kind: 'amount', amount: '12500.5', currency: 'NIM' } }) }).text()).toContain('12\u202F500.5 NIM')
    const change = render({ view: view({ info: { kind: 'change', percent: -3.21 } }) })
    expect(change.text()).toContain('−3.2 %')
    expect(change.find('.text-cherry').exists()).toBe(true)
    expect(render({ view: view({ value: { kind: 'pending' } }) }).text()).toContain('…')
  })

  it('opens the widget URL on tap and the menu from ⋯', async () => {
    const wrapper = render({ view: view() })
    await wrapper.find('[data-testid="widget-open"]').trigger('click')
    await wrapper.find('[data-testid="widget-menu"]').trigger('click')
    expect(wrapper.emitted('open')).toEqual([['https://swap.example/?swap=abc']])
    expect(wrapper.emitted('menu')).toHaveLength(1)
  })

  it('cannot be opened and has no menu as a gallery preview', async () => {
    const wrapper = render({ view: view(), preview: true })
    expect(wrapper.find('[data-testid="widget-open"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="widget-menu"]').exists()).toBe(false)
  })

  it('says since when a stale widget was last updated', () => {
    const staleSince = new Date().setHours(14, 5, 0, 0)
    expect(render({ view: view({ staleSince }) }).text()).toContain('Not updated since 14:05')
  })

  it('adds the date to a stale time from another day', () => {
    const staleSince = new Date(Date.now() - 3 * 86_400_000).setHours(14, 5, 0, 0)
    const expected = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(staleSince)
    const text = render({ view: view({ staleSince }) }).text()
    expect(text).toContain(`Not updated since ${expected}`)
    expect(text).not.toContain('since 14:05')
  })

  it('formats fiat by its own fraction digits, and small amounts by significant digits', () => {
    const text = (amount: string, currency: string) => render({ view: view({ value: { kind: 'amount', amount, currency } }) }).text()
    expect(text('0.5', 'EUR')).toContain('€0.50')
    expect(text('1234.5', 'EUR')).toContain('€1,234.50')
    expect(text('1234', 'JPY')).toMatch(/¥1,234(?![.\d])/)
    expect(text('0.00123', 'EUR')).toContain('€0.00123')
  })

  it('shows a change that rounds to zero without sign or colour', () => {
    const flat = render({ view: view({ info: { kind: 'change', percent: -0.04 } }) })
    expect(flat.text()).toContain('0.0 %')
    expect(flat.text()).not.toContain('−0.0')
    expect(flat.find('.text-cherry').exists()).toBe(false)
    expect(flat.find('.text-mint').exists()).toBe(false)
  })

  it('keeps every digit of a tiny crypto amount', () => {
    expect(render({ view: view({ value: { kind: 'amount', amount: '0.000000001', currency: 'ETH' } }) }).text()).toContain('0.000000001 ETH')
  })

  it('shows the tone dot before the value when there is no label', () => {
    const wrapper = render({ view: view({ label: '' }) })
    expect(wrapper.find('[data-testid="widget-label"]').exists()).toBe(false)
    const html = wrapper.html()
    expect(html.indexOf('bg-pumpkin')).toBeGreaterThan(-1)
    expect(html.indexOf('bg-pumpkin')).toBeLessThan(html.indexOf('>0.05 ETH<'))
  })

  it('draws no dot for the neutral tone', () => {
    for (const size of ['icon', 'small'] as const) {
      expect(render({ view: view({ size, tone: 'attention' }) }).findAll('span.rounded-full').length).toBeGreaterThan(0)
      expect(render({ view: view({ size, tone: 'neutral' }) }).findAll('span.rounded-full')).toHaveLength(0)
    }
  })

  it('opens the menu on a long press or the context menu on every size, without opening the Mini App', async () => {
    vi.useFakeTimers()
    for (const size of ['icon', 'small', 'medium', 'large'] as const) {
      const wrapper = render({ view: view({ size }) })
      // The long-press listeners attach after the first render.
      await flushPromises()
      const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      wrapper.element.dispatchEvent(contextMenu)
      expect(contextMenu.defaultPrevented).toBe(true)
      expect(wrapper.emitted('menu')).toHaveLength(1)
      const card = wrapper.find('[data-testid="widget-open"]')
      await card.trigger('pointerdown')
      await vi.advanceTimersByTimeAsync(500)
      await card.trigger('pointerup')
      click(card.element, 1)
      expect(wrapper.emitted('menu')).toHaveLength(2)
      expect(wrapper.emitted('open')).toBeUndefined()
      await card.trigger('pointerdown')
      await card.trigger('pointerup')
      click(card.element, 1)
      expect(wrapper.emitted('open')).toHaveLength(1)
    }
  })

  it('opens the Mini App on a keyboard or assistive click right after a long press', async () => {
    vi.useFakeTimers()
    const wrapper = render({ view: view() })
    await flushPromises()
    const card = wrapper.find('[data-testid="widget-open"]')
    await card.trigger('pointerdown')
    await vi.advanceTimersByTimeAsync(500)
    await card.trigger('pointerup')
    click(card.element, 0)
    expect(wrapper.emitted('menu')).toHaveLength(1)
    expect(wrapper.emitted('open')).toEqual([['https://swap.example/?swap=abc']])
  })

  it('labels a widget without a URL as one group for screen readers', () => {
    const card = render({ view: view({ url: undefined }) })
    expect(card.attributes()).toMatchObject({ 'role': 'group', 'aria-label': expect.stringContaining('Swap') })
    expect(render({ view: view() }).attributes('role')).toBeUndefined()
  })

  it('opens nothing for a widget without a URL, while a long press still opens its menu', async () => {
    vi.useFakeTimers()
    const wrapper = render({ view: view({ url: undefined }) })
    await flushPromises()
    expect(wrapper.find('[data-testid="widget-open"]').exists()).toBe(false)
    wrapper.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(500)
    expect(wrapper.emitted('menu')).toHaveLength(1)
  })

  it('opens no menu on a long press or the context menu as a gallery preview', async () => {
    vi.useFakeTimers()
    const wrapper = render({ view: view(), preview: true })
    await flushPromises()
    wrapper.element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    wrapper.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(500)
    expect(wrapper.emitted('menu')).toBeUndefined()
  })

  it('draws the icon size as a bare app icon whose menu shows only on keyboard focus', () => {
    const icon = render({ view: view({ size: 'icon' }) })
    expect(icon.classes()).not.toContain('bg-white')
    expect(icon.find('[data-testid="widget-menu"]').classes()).toEqual(expect.arrayContaining(['opacity-0', 'pointer-events-none', 'focus-visible:opacity-100', 'focus-visible:pointer-events-auto']))
    expect(render({ view: view({ size: 'small' }) }).classes()).toContain('bg-white')
  })

  it('hides the progress bar on small and an expired countdown on medium', () => {
    expect(render({ view: view() }).find('[data-testid="widget-progress"]').exists()).toBe(false)
    const expired = render({ view: view({ size: 'medium', countdown: { label: 'Deposit window', until: Date.now() - 1000 } }) })
    expect(expired.text()).not.toContain('Deposit window')
  })

  it('turns row links into plain rows as a preview', () => {
    const wrapper = render({ view: view({ size: 'large' }), preview: true })
    expect(wrapper.find('[data-testid="widget-row-link"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Order')
  })

  it('lets taps on plain rows reach the card button, and only row links take their own', () => {
    const wrapper = render({ view: view({ size: 'large' }) })
    expect(wrapper.find('[data-testid="widget-rows"]').classes()).toContain('pointer-events-none')
    expect(wrapper.find('[data-testid="widget-row-link"]').classes()).toContain('pointer-events-auto')
  })

  it('scales bars from zero and lines from their lowest point', () => {
    const bars = render({ view: view({ size: 'large', rows: [], chart: { kind: 'bars', points: [5, 6] } }) }).findAll('[data-testid="widget-chart"] rect')
    expect(Number(bars[0]!.attributes('height'))).toBeGreaterThan(20)
    expect(render({ view: view({ size: 'large', rows: [] }) }).find('polyline').attributes('points')).toMatch(/^0,30 /)
  })

  it('truncates long texts', () => {
    const wrapper = render({ view: view({ label: 'W'.repeat(24) }) })
    expect(wrapper.find('[data-testid="widget-label"]').classes()).toEqual(expect.arrayContaining(['truncate', 'min-w-0']))
  })

  it('spreads a small card\'s lines over its height, with text values a size smaller', () => {
    const small = render({ view: view({ size: 'small', value: { kind: 'text', text: 'Start a swap' } }) })
    expect(small.classes()).toContain('justify-between')
    expect(small.find('[data-testid="widget-value"]').classes()).toContain('text-xl')
    expect(render({ view: view({ size: 'small' }) }).find('[data-testid="widget-value"]').classes()).toContain('text-2xl')
    expect(render({ view: view({ size: 'medium', value: { kind: 'text', text: 'Start a swap' } }) }).classes()).not.toContain('justify-between')
  })

  it('spans its size in the four-column grid', () => {
    expect(render({ view: view({ size: 'icon' }) }).classes()).toContain('col-span-1')
    expect(render({ view: view({ size: 'small' }) }).classes()).toEqual(expect.arrayContaining(['col-span-2', 'row-span-2']))
    expect(render({ view: view({ size: 'large' }) }).classes()).toContain('col-span-4')
  })

  it('describes the whole card for screen readers', () => {
    expect(render({ view: view() }).find('[data-testid="widget-open"]').attributes('aria-label')).toBe('Swap: Waiting for your deposit, 0.05 ETH, for about 1,234 NIM')
  })
})
