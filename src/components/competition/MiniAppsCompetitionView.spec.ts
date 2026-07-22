import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import MiniAppsCompetitionView from './MiniAppsCompetitionView.vue'

const state = vi.hoisted(() => ({
  httpGet: vi.fn(),
  preferences: new Map<string, string>(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web' },
  CapacitorHttp: { get: state.httpGet },
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: state.preferences.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string, value: string }) => { state.preferences.set(key, value) }),
    remove: vi.fn(async ({ key }: { key: string }) => { state.preferences.delete(key) }),
  },
}))

vi.mock('@/lib', () => ({ isTestnet: false }))

vi.mock('@/lib/site-metadata', () => ({
  getFaviconUrl: (url: string) => `https://icons.example/${encodeURIComponent(url)}`,
  getGoogleFaviconUrl: (url: string) => `https://google.example/${encodeURIComponent(url)}`,
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({ query: vi.fn(() => Promise.resolve(undefined)), run: vi.fn(() => Promise.resolve()) }),
}))

const IonButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: { type: Boolean, default: false } },
  emits: ['click'],
  template: '<button :disabled="disabled" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
})

function translate(value: string, params: Record<string, unknown> = {}) {
  return Object.entries(params).reduce((text, [key, replacement]) => text.replace(`{${key}}`, String(replacement)), value)
}

function remoteApp(overrides: Record<string, unknown> = {}) {
  return {
    cycle: 'cycle1',
    app_name: 'Roundtrip',
    category: 'Productivity',
    tagline: 'Split the trip. Settle in a tap.',
    description: 'Track shared expenses and settle in NIM.',
    pricing: 'Free',
    url: 'https://roundtrip.example/',
    repo_url: 'https://github.com/example/roundtrip',
    video_url: 'https://youtu.be/example',
    icon: 'https://assets.example/icon.png',
    thumbnail: 'https://assets.example/thumbnail.png',
    screenshots: ['https://assets.example/one.png', 'https://assets.example/two.png'],
    github_login: 'builder',
    x_account: 'builder',
    team_name: 'Roundtrip Team',
    team_members: ['Ada'],
    submitted_at: '2026-07-10T12:36:19.329Z',
    ...overrides,
  }
}

function response(apps: unknown[]) {
  return {
    status: 200,
    data: { generated_at: '2026-07-22T11:22:14.251Z', commit: '457ce53', apps },
  }
}

function mountView() {
  return mount(MiniAppsCompetitionView, {
    global: {
      plugins: [createPinia()],
      mocks: { $t: translate },
      stubs: {
        IonButton: IonButtonStub,
      },
    },
  })
}

describe('competition view', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    state.httpGet.mockReset()
    state.preferences.clear()
  })

  it('defaults to newest cycle and switches cycles without reordering entries', async () => {
    state.httpGet.mockResolvedValue(response([
      remoteApp({ cycle: 'cycle1', app_name: 'Older', url: 'https://older.example/' }),
      remoteApp({ cycle: 'cycle2', app_name: 'First New', url: 'https://first.example/' }),
      remoteApp({ cycle: 'cycle2', app_name: 'Second New', url: 'https://second.example/' }),
    ]))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text().match(/Mini Apps Competition/g)).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Cycle Programme')
    expect(wrapper.text()).toContain('Submissions')
    expect(wrapper.find('[data-testid="competition-submission-count"]').text()).toBe('2')
    expect(wrapper.text()).toContain('First New')
    expect(wrapper.text()).toContain('Second New')
    expect(wrapper.text()).not.toContain('Older')
    expect(wrapper.findAll('[data-testid^="competition-entry-"]').map(item => item.text())).toEqual([
      expect.stringContaining('First New'),
      expect.stringContaining('Second New'),
    ])

    await wrapper.findAll('[role="tab"]').find(tab => tab.text() === 'Cycle 1')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Older')
    expect(wrapper.text()).not.toContain('First New')
  })

  it('emits the selected entry without replacing the list or changing its scroll position', async () => {
    state.httpGet.mockResolvedValue(response([remoteApp()]))
    const wrapper = mountView()
    await flushPromises()
    const scroller = wrapper.find('.competition-scroll').element as HTMLElement
    scroller.scrollTop = 128

    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Entry 01')
    expect(wrapper.find('[data-testid="competition-entry-0"]').text()).not.toContain('Free')
    await wrapper.find('[data-testid="competition-entry-0"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="competition-entry-0"]').exists()).toBe(true)
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({
      name: 'Roundtrip',
      url: 'https://roundtrip.example/',
    })
    expect(scroller.scrollTop).toBe(128)
  })

  it('shows retry after initial failure and recovers', async () => {
    state.httpGet
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response([remoteApp()]))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="competition-error"]').exists()).toBe(true)
    await wrapper.find('[data-testid="competition-error"] button').trigger('click')
    await flushPromises()

    expect(state.httpGet).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="competition-entry-0"]').exists()).toBe(true)
  })
})
