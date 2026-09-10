// @vitest-environment jsdom
import type { Lab } from './useLab'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, provide } from 'vue'
import RunReport from './RunReport.vue'
import ScenarioRunner from './ScenarioRunner.vue'
import { labKey, useLab } from './useLab'
import WalletSetup from './WalletSetup.vue'

vi.mock('./gateway', () => ({
  CoreGateway: class {
    async stopListening() {}
    async listen() {}

    importOwner(words: string) {
      if (words !== 'owner words')
        throw new Error('Invalid words')
      return 'owner-address'
    }

    importSpammer(words: string) {
      if (words !== 'spam words')
        throw new Error('Invalid words')
      return 'spam-address'
    }

    generateSpammer() { return { address: 'spam-address', words: 'spam words' } }
  },
}))

let lab: Lab
let wrapper: ReturnType<typeof mount>
beforeEach(() => localStorage.clear())
afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
})

function setup() {
  wrapper = mount(defineComponent({
    setup() {
      lab = useLab()
      provide(labKey, lab)
      return () => h('div', [h(WalletSetup), h(ScenarioRunner), h(RunReport)])
    },
  }))
  return wrapper
}

describe('operator dashboard', () => {
  it('shows every scenario and calculates owner reserves including reused drained funds', async () => {
    setup()
    expect(wrapper.findAll('.scenario-tab')).toHaveLength(4)
    await wrapper.get('#fee').setValue('5')
    expect(wrapper.get('.funding-summary').text()).toContain('0.0201 NIM')
    await wrapper.findAll('.scenario-tab')[1].trigger('click')
    expect(wrapper.get('.funding-summary').text()).toContain('0.01015 NIM')
    await wrapper.findAll('.scenario-tab')[2].trigger('click')
    expect(wrapper.get('.funding-summary').text()).toContain('0.01005 NIM')
    expect(wrapper.find('#expiry').exists()).toBe(true)
    await wrapper.findAll('.scenario-tab')[3].trigger('click')
    expect(wrapper.get('.funding-summary').text()).toContain('0.015 NIM')
    expect((wrapper.get('#count').element as HTMLInputElement).value).toBe('250')
    await wrapper.get('#count').setValue('1001')
    expect(wrapper.get('.funding-summary').text()).toContain('1–1,000')
  })

  it('prevents empty reports and verdicts before a run', async () => {
    setup()
    expect((wrapper.get('#restart').element as HTMLSelectElement).matches(':disabled')).toBe(true)
    expect(wrapper.findAll('button').find(b => b.text() === 'Export JSON report')!.attributes('disabled')).toBeDefined()
    lab.state.runId = 'test-run'
    await wrapper.vm.$nextTick()
    expect((wrapper.get('#restart').element as HTMLSelectElement).matches(':disabled')).toBe(false)
  })

  it('keeps pause and cancel available while submitted transactions are being checked', async () => {
    setup()
    lab.state.stage = 'spamming'
    lab.state.busy = true
    lab.state.config = { scenario: 'bomb', amount: 1000, fee: 0, expiryMinutes: 5, count: 250 }
    await wrapper.vm.$nextTick()
    expect(wrapper.get('progress').attributes('aria-label')).toBe('Confirmed spam transfers')
    await wrapper.findAll('button').find(b => b.text() === 'Pause spam')!.trigger('click')
    expect(lab.state.paused).toBe(true)
    expect(wrapper.get('.run-status').text()).toContain('Spam paused')
    await wrapper.findAll('button').find(b => b.text() === 'Cancel scenario')!.trigger('click')
    expect(lab.state.stage).toBe('cancelled')
    expect(wrapper.text()).not.toContain('Review & create htlc b')
  })

  it('keeps cleanup locked during observation and exposes it when observation ends', async () => {
    setup()
    lab.state.stage = 'observe'
    lab.state.observing = true
    lab.state.config = { scenario: 'two', amount: 1000, fee: 0, expiryMinutes: 5, count: 250 }
    lab.state.contracts = [{ label: 'A', address: 'tool-contract', balance: 1000, expiry: 1, registered: true }]
    await wrapper.vm.$nextTick()
    const cleanup = wrapper.findAll('button').find(b => b.text() === 'Return A funds')!
    expect(cleanup.attributes('disabled')).toBeDefined()
    await wrapper.get('.cleanup input').setValue(false)
    expect(cleanup.attributes('disabled')).toBeUndefined()
  })

  it('does not misrepresent unloaded balances as zero', async () => {
    setup()
    lab.state.owner = 'owner'
    lab.state.spammer = 'spammer'
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.balance').every(b => b.text().includes('Not synced'))).toBe(true)
  })
})

describe('saved wallets', () => {
  it('restores both addresses after reload with recovery words hidden', () => {
    setup()
    lab.words.value = 'owner words'
    lab.importOwner()
    lab.generateSpammer()
    expect(lab.words.value).toBe('')
    wrapper.unmount()
    setup()
    expect(lab.state.owner).toBe('owner-address')
    expect(lab.state.spammer).toBe('spam-address')
    expect(lab.spamWords.value).toBe('spam words')
    expect(lab.showSpamWords.value).toBe(false)
    expect(lab.state.connected).toBe(false)
    expect(lab.state.runId).toBe('')
    lab.forgetSavedWallets()
    expect(localStorage.getItem('htlc-lab.wallets.v1')).toBeNull()
    expect(lab.state.owner).toBe('owner-address')
    wrapper.unmount()
    setup()
    expect(lab.state.owner).toBe('')
    expect(lab.state.spammer).toBe('')
  })

  it('keeps loaded wallets available if persistence fails', () => {
    setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Unavailable')
    })
    lab.words.value = 'owner words'
    expect(() => lab.importOwner()).toThrow('could not be saved')
    expect(lab.words.value).toBe('')
    expect(lab.state.owner).toBe('owner-address')
    expect(() => lab.generateSpammer()).toThrow('could not be saved')
    expect(lab.spamWords.value).toBe('spam words')
    expect(lab.showSpamWords.value).toBe(true)
  })

  it('handles corrupt storage without exposing its contents', () => {
    localStorage.setItem('htlc-lab.wallets.v1', 'corrupt private contents')
    setup()
    expect(lab.state.error).toContain('could not be fully restored')
    expect(lab.state.error).not.toContain('private contents')
    expect(lab.state.owner).toBe('')
  })
})

describe('deposit controls', () => {
  it('enables reports and notes but blocks new sends and clearing while a deposit is unresolved', async () => {
    setup()
    lab.state.transactions.push({ hash: 'deposit', kind: 'deposit', sender: 'spam', recipient: 'owner', value: 1000, fee: 0, validityStartHeight: 1, submittedAt: 1, state: 'unknown' })
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('button').find(b => b.text() === 'Export deposit report')!.attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('button').find(b => b.text() === 'Clear deposit session')!.attributes('disabled')).toBeDefined()
    expect(wrapper.get('#notes').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('#restart').exists()).toBe(false)
    expect(wrapper.text()).toContain('Latest deposit: unknown')
    expect(wrapper.text()).toContain('Recheck & rebroadcast')
  })
})

describe('disabled button explanations', () => {
  it.each(['empty', 'busy', 'pending', 'observing', 'empty-contract'] as const)('explains every disabled button in %s state', async (state) => {
    setup()
    if (state === 'busy')
      lab.working.value = true
    if (state === 'pending') {
      lab.state.transactions.push({ hash: 'pending-deposit', kind: 'deposit', sender: 'spam', recipient: 'owner', value: 1, fee: 0, validityStartHeight: 1, submittedAt: 1, state: 'unknown' })
    }
    if (state === 'observing' || state === 'empty-contract') {
      lab.state.stage = 'observe'
      lab.state.observing = state === 'observing'
      lab.state.spammer = 'spam'
      lab.state.config = { scenario: 'two', amount: 1000, fee: 0, expiryMinutes: 5, count: 250 }
      lab.state.contracts = [{ label: 'A', address: 'contract', balance: state === 'observing' ? 1000 : 0, expiry: 1, registered: true }]
    }
    await wrapper.vm.$nextTick()
    const buttons = wrapper.findAll('button:disabled')
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      const id = button.attributes('aria-describedby')
      expect(id, button.text()).toBeTruthy()
      const reason = wrapper.find(`[id="${id}"]`)
      expect(reason.exists(), button.text()).toBe(true)
      expect(reason.text().trim().length, button.text()).toBeGreaterThan(10)
    }
  })
})

describe('hTLC inventory', () => {
  it('shows empty and funded contracts once with NIM balances', async () => {
    setup()
    lab.state.connected = true
    lab.state.head.timestamp = 2000
    lab.state.htlcInventory = [{ address: 'old-empty', balance: 0, expiry: 1000 }, { address: 'current', balance: 1000, expiry: 3000 }]
    lab.state.contracts = [{ address: 'current', balance: 2000, expiry: 3000, label: 'A', registered: true }]
    await wrapper.vm.$nextTick()
    const region = wrapper.get('[aria-label="All app wallet HTLCs"]')
    expect(region.findAll('tbody tr')).toHaveLength(2)
    expect(region.text()).toContain('Empty')
    expect(region.text()).toContain('0.02')
    expect(region.text()).toContain('Current balance · NIM')
  })
})
