import type { RowDApp } from '@/stores/mini-apps'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MiniAppRow from './MiniAppRow.vue'

const REPORT_URL = 'https://nimpay.app/miniapps/evm/evm-mini-wallet/report'

vi.mock('@/stores/mini-apps', () => ({
  useMiniApps: () => ({
    getMiniAppReportUrl: (url: string) => (url.includes('evm-mini-wallet') ? REPORT_URL : undefined),
  }),
}))

interface RowProps {
  dapp: RowDApp
  removable?: boolean
  tappable?: boolean
  menuTestid?: string
  buttonTestid?: string
}

function mountRow(props: RowProps) {
  return mount(MiniAppRow, {
    props,
    global: {
      stubs: {
        IonSkeletonText: { template: '<div class="skeleton" />' },
      },
    },
  })
}

const awesomeApp = { url: 'https://evm-mini-wallet.vercel.app/', name: 'EVM Mini Wallet', icon: '' }
const otherApp = { url: 'https://example.com/', name: 'Example', icon: '' }

describe('miniAppRow', () => {
  it('always shows the kebab (Share applies to every Mini App)', () => {
    const reportable = mountRow({ dapp: awesomeApp, menuTestid: 'menu' })
    expect(reportable.find('[data-testid="menu"]').exists()).toBe(true)

    const plain = mountRow({ dapp: otherApp, menuTestid: 'menu' })
    expect(plain.find('[data-testid="menu"]').exists()).toBe(true)
  })

  it('emits menu without a report url for non awesome-list apps', async () => {
    const wrapper = mountRow({ dapp: otherApp, menuTestid: 'menu' })
    await wrapper.find('[data-testid="menu"]').trigger('click')

    expect(wrapper.emitted('menu')?.[0]).toEqual([{
      app: { name: 'Example', url: 'https://example.com/', icon: '' },
      reportUrl: undefined,
      removable: false,
    }])
  })

  it('emits menu with the report url and removable flag', async () => {
    const wrapper = mountRow({ dapp: awesomeApp, removable: true, menuTestid: 'menu' })
    await wrapper.find('[data-testid="menu"]').trigger('click')

    expect(wrapper.emitted('menu')?.[0]).toEqual([{
      app: { name: 'EVM Mini Wallet', url: 'https://evm-mini-wallet.vercel.app/', icon: '' },
      reportUrl: REPORT_URL,
      removable: true,
    }])
  })

  it('emits open when tappable and the row body is clicked', async () => {
    const wrapper = mountRow({ dapp: awesomeApp, buttonTestid: 'row' })
    await wrapper.find('[data-testid="row"]').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('does not emit open when not tappable (parent owns the tap)', async () => {
    const wrapper = mountRow({ dapp: awesomeApp, tappable: false, buttonTestid: 'row' })
    await wrapper.find('[data-testid="row"]').trigger('click')
    expect(wrapper.emitted('open')).toBeUndefined()
  })
})
