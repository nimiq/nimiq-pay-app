import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  httpGet: vi.fn(),
  preferences: new Map<string, string>(),
}))

vi.mock('@capacitor/core', () => ({
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
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({ query: vi.fn(), run: vi.fn() }),
}))

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
    screenshots: ['https://assets.example/one.png', 'not-a-url', 'https://assets.example/two.png'],
    github_login: 'builder',
    x_account: '@builder',
    team_name: 'Roundtrip Team',
    team_members: ['Ada', '', 123],
    submitted_at: '2026-07-10T12:36:19.329Z',
    ...overrides,
  }
}

function response(apps: unknown[]) {
  return {
    status: 200,
    data: {
      generated_at: '2026-07-22T11:22:14.251Z',
      commit: '457ce53',
      apps,
    },
  }
}

describe('competition Mini Apps store', () => {
  beforeEach(() => {
    state.httpGet.mockReset()
    state.preferences.clear()
    setActivePinia(createPinia())
    vi.resetModules()
  })

  it('maps every supported feed field and sanitizes optional values', async () => {
    state.httpGet.mockResolvedValue(response([remoteApp()]))
    const { useCompetitionMiniApps } = await import('./competition-mini-apps')
    const store = useCompetitionMiniApps()

    await store.load()

    expect(store.apps).toEqual([{
      cycle: 'cycle1',
      name: 'Roundtrip',
      category: 'Productivity',
      tagline: 'Split the trip. Settle in a tap.',
      description: 'Track shared expenses and settle in NIM.',
      pricing: 'Free',
      url: 'https://roundtrip.example/',
      repositoryUrl: 'https://github.com/example/roundtrip',
      videoUrl: 'https://youtu.be/example',
      icon: 'https://assets.example/icon.png',
      thumbnail: 'https://assets.example/thumbnail.png',
      screenshots: ['https://assets.example/one.png', 'https://assets.example/two.png'],
      githubLogin: 'builder',
      xAccount: 'builder',
      teamName: 'Roundtrip Team',
      teamMembers: ['Ada'],
      submittedAt: '2026-07-10T12:36:19.329Z',
    }])
  })

  it('keeps valid entries and drops malformed entries', async () => {
    state.httpGet.mockResolvedValue(response([
      remoteApp(),
      remoteApp({ app_name: '', url: 'javascript:alert(1)' }),
      null,
    ]))
    const { useCompetitionMiniApps } = await import('./competition-mini-apps')
    const store = useCompetitionMiniApps()

    await store.load()

    expect(store.apps.map(app => app.name)).toEqual(['Roundtrip'])
  })

  it('drops entries whose Mini App URL is cleartext http', async () => {
    state.httpGet.mockResolvedValue(response([
      remoteApp(),
      remoteApp({ app_name: 'Cleartext', url: 'http://cleartext.example/' }),
    ]))
    const { useCompetitionMiniApps } = await import('./competition-mini-apps')
    const store = useCompetitionMiniApps()

    await store.load()

    expect(store.apps.map(app => app.name)).toEqual(['Roundtrip'])
  })

  it('sorts cycles newest-first and preserves app order inside each cycle', async () => {
    state.httpGet.mockResolvedValue(response([
      remoteApp({ cycle: 'cycle2', app_name: 'First', url: 'https://first.example/' }),
      remoteApp({ cycle: 'cycle1', app_name: 'Old', url: 'https://old.example/' }),
      remoteApp({ cycle: 'cycle10', app_name: 'Newest', url: 'https://newest.example/' }),
      remoteApp({ cycle: 'cycle2', app_name: 'Second', url: 'https://second.example/' }),
    ]))
    const { useCompetitionMiniApps } = await import('./competition-mini-apps')
    const store = useCompetitionMiniApps()

    await store.load()

    expect(store.cycles).toEqual(['cycle10', 'cycle2', 'cycle1'])
    expect(store.apps.filter(app => app.cycle === 'cycle2').map(app => app.name)).toEqual(['First', 'Second'])
  })

  it('replaces cached data after a successful refresh', async () => {
    state.preferences.set('miniAppsCompetitionFeed', JSON.stringify({
      apps: [{
        cycle: 'cycle1',
        name: 'Cached',
        category: 'Games',
        tagline: 'Cached',
        description: 'Cached',
        url: 'https://cached.example/',
        icon: 'https://cached.example/icon.png',
        screenshots: [],
        teamMembers: [],
      }],
    }))
    state.httpGet.mockResolvedValue(response([remoteApp({ cycle: 'cycle2', app_name: 'Fresh' })]))
    const { useCompetitionMiniApps } = await import('./competition-mini-apps')
    const store = useCompetitionMiniApps()

    await vi.waitFor(() => expect(store.apps.map(app => app.name)).toEqual(['Cached']))
    await store.load()

    expect(store.apps.map(app => app.name)).toEqual(['Fresh'])
    expect(JSON.parse(state.preferences.get('miniAppsCompetitionFeed') ?? '{}').apps[0].name).toBe('Fresh')
  })

  it('falls back to cache when refresh fails', async () => {
    state.preferences.set('miniAppsCompetitionFeed', JSON.stringify({
      apps: [{
        cycle: 'cycle1',
        name: 'Cached',
        category: 'Games',
        tagline: 'Cached',
        description: 'Cached',
        url: 'https://cached.example/',
        icon: 'https://cached.example/icon.png',
        screenshots: [],
        teamMembers: [],
      }],
    }))
    state.httpGet.mockRejectedValue(new Error('offline'))
    const { useCompetitionMiniApps } = await import('./competition-mini-apps')
    const store = useCompetitionMiniApps()

    await vi.waitFor(() => expect(store.apps.map(app => app.name)).toEqual(['Cached']))
    await store.load()

    expect(store.apps.map(app => app.name)).toEqual(['Cached'])
    expect(store.hasRefreshError).toBe(true)
  })

  it('keeps cached data when every remote entry is malformed', async () => {
    state.preferences.set('miniAppsCompetitionFeed', JSON.stringify({
      apps: [{
        cycle: 'cycle1',
        name: 'Cached',
        category: 'Games',
        tagline: 'Cached',
        description: 'Cached',
        url: 'https://cached.example/',
        icon: 'https://cached.example/icon.png',
        screenshots: [],
        teamMembers: [],
      }],
    }))
    state.httpGet.mockResolvedValue(response([
      remoteApp({ app_name: '', url: 'javascript:alert(1)' }),
    ]))
    const { useCompetitionMiniApps } = await import('./competition-mini-apps')
    const store = useCompetitionMiniApps()

    await vi.waitFor(() => expect(store.apps.map(app => app.name)).toEqual(['Cached']))
    await store.load()

    expect(store.apps.map(app => app.name)).toEqual(['Cached'])
    expect(store.hasRefreshError).toBe(true)
  })

  it('allows retry after failure', async () => {
    state.httpGet
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response([remoteApp()]))
    const { useCompetitionMiniApps } = await import('./competition-mini-apps')
    const store = useCompetitionMiniApps()

    await store.load()
    await store.load()

    expect(state.httpGet).toHaveBeenCalledTimes(2)
    expect(store.apps.map(app => app.name)).toEqual(['Roundtrip'])
    expect(store.hasRefreshError).toBe(false)
  })
})
