import type { MiniAppMenuContext } from '@/stores/mini-apps'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { miniAppOpenDeeplink } from '@/lib/mini-app-deeplink'
import MiniAppActionsSheet from './MiniAppActionsSheet.vue'

const REPORT_URL = 'https://nimpay.app/miniapps/evm/evm-mini-wallet/report'

const { browserOpen, shareShare } = vi.hoisted(() => ({
  browserOpen: vi.fn(() => Promise.resolve()),
  shareShare: vi.fn(() => Promise.resolve()),
}))

vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }))
vi.mock('@capacitor/share', () => ({ Share: { share: shareShare } }))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(() => Promise.resolve()) },
  ImpactStyle: { Light: 'LIGHT' },
}))

const { translate } = vi.hoisted(() => {
  const german: Record<string, string> = { 'Small': 'Klein', 'Large': 'Groß', 'Size': 'Größe', 'Widget size': 'Widget-Größe', 'Remove from Home': 'Von Home entfernen' }
  return { translate: (message: string) => german[message] ?? message }
})
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: translate } }))

const app = { name: 'EVM Mini Wallet', url: 'https://evm-mini-wallet.vercel.app/', icon: '' }

let wrapper: ReturnType<typeof mount> | undefined

async function mountSheet(context: MiniAppMenuContext) {
  browserOpen.mockClear()
  shareShare.mockClear()
  wrapper = mount(MiniAppActionsSheet, { props: { open: true, context }, attachTo: document.body, global: { mocks: { $t: translate } } })
  await flushPromises()
  return wrapper
}

function action(testid: string): HTMLElement | null {
  // Reka portals the sheet content to document.body, outside the wrapper root.
  return document.body.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
})

describe('miniAppActionsSheet', () => {
  it('shows share and report but not remove when the app is reportable but not removable', async () => {
    await mountSheet({ app, reportUrl: REPORT_URL, removable: false })
    expect(action('mini-app-share-action')).not.toBeNull()
    expect(action('mini-app-report-action')).not.toBeNull()
    expect(action('mini-app-remove-action')).toBeNull()
  })

  it('always shows share, even without report or remove', async () => {
    await mountSheet({ app, reportUrl: undefined, removable: false })
    expect(action('mini-app-share-action')).not.toBeNull()
    expect(action('mini-app-report-action')).toBeNull()
    expect(action('mini-app-remove-action')).toBeNull()
  })

  it('shares the open-deeplink with a CTA via the system share sheet and closes', async () => {
    const w = await mountSheet({ app, reportUrl: REPORT_URL, removable: false })
    action('mini-app-share-action')!.click()
    await flushPromises()

    expect(shareShare).toHaveBeenCalledWith({
      title: 'EVM Mini Wallet',
      text: 'Check out EVM Mini Wallet! You can try this Mini App in Nimiq Pay.',
      url: miniAppOpenDeeplink('https://evm-mini-wallet.vercel.app/'),
    })
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('opens the report URL in the system browser and closes', async () => {
    const w = await mountSheet({ app, reportUrl: REPORT_URL, removable: false })
    action('mini-app-report-action')!.click()
    await flushPromises()

    expect(browserOpen).toHaveBeenCalledWith({ url: REPORT_URL, toolbarColor: '#0582CA' })
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('shows the remove action and emits remove when chosen', async () => {
    const w = await mountSheet({ app, reportUrl: REPORT_URL, removable: true })
    expect(action('mini-app-remove-action')).not.toBeNull()

    action('mini-app-remove-action')!.click()
    await flushPromises()

    expect(w.emitted('remove')).toHaveLength(1)
    expect(browserOpen).not.toHaveBeenCalled()
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('offers the widget sizes and Remove from Home for a widget', async () => {
    const wrapper = await mountSheet({ app, removable: false, widget: { size: 'small', sizes: ['large', 'small'] } })
    const sizes = Array.from(document.body.querySelectorAll('[data-testid^="mini-app-widget-size-"]'), button => button.textContent?.trim())
    expect(sizes).toEqual(['Klein', 'Groß'])
    expect(action('mini-app-widget-size-small')?.getAttribute('aria-pressed')).toBe('true')
    action('mini-app-widget-size-large')!.click()
    action('mini-app-remove-widget-action')!.click()
    expect(wrapper.emitted('size')).toEqual([['large']])
    expect(wrapper.emitted('removeWidget')).toHaveLength(1)
  })

  it('names the widget rows in the user\'s language', async () => {
    await mountSheet({ app, removable: false, widget: { size: 'small', sizes: ['small', 'large'] } })
    const sizeRow = document.body.querySelector('[data-testid="mini-app-widget-size"]')!
    expect(sizeRow.querySelector('span')!.textContent!.trim()).toBe('Größe')
    expect(sizeRow.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Widget-Größe')
    expect(action('mini-app-remove-widget-action')!.textContent!.trim()).toBe('Von Home entfernen')
  })

  it('shows no Size row for a single-size widget, but still offers Remove', async () => {
    await mountSheet({ app, removable: false, widget: { size: 'small', sizes: ['small'] } })
    expect(document.body.querySelector('[data-testid="mini-app-widget-size"]')).toBeNull()
    expect(action('mini-app-remove-widget-action')).not.toBeNull()
  })

  it('extends the size buttons hit area without growing them', async () => {
    await mountSheet({ app, removable: false, widget: { size: 'small', sizes: ['small', 'large'] } })
    expect(action('mini-app-widget-size-small')!.classList.contains('before:-inset-y-1.5')).toBe(true)
    expect(action('mini-app-widget-size-small')!.classList.contains('min-h-11')).toBe(false)
  })

  it('shows no widget rows for a plain Mini App menu', async () => {
    await mountSheet({ app, removable: true })
    expect(action('mini-app-remove-widget-action')).toBeNull()
    expect(document.body.querySelector('[data-testid="mini-app-widget-size"]')).toBeNull()
  })
})
