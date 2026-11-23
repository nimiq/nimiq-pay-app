import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'

const { getBundleVersion, appStore } = vi.hoisted(() => ({
  getBundleVersion: vi.fn(),
  appStore: { lastSeenChangelogVersion: undefined as any },
}))

vi.mock('@/lib/app-version', () => ({ getBundleVersion }))
vi.mock('@/data/changelog.json', () => ({
  default: [
    { version: '2.24.1', date: '2026-11-20', highlights: [] },
    { version: '2.24.0', date: '2026-11-17', highlights: [] },
  ],
}))
vi.mock('@/stores/app', () => ({
  useApp: () => reactive({
    lastSeenChangelogVersion: appStore.lastSeenChangelogVersion,
    changelogCardVersion: ref(''),
    changelogCardShownCount: ref(0),
  }),
}))

async function setup(runningVersion: string, lastSeen: string) {
  vi.resetModules()
  getBundleVersion.mockResolvedValue(runningVersion)
  appStore.lastSeenChangelogVersion = ref(lastSeen)
  const { useChangelog } = await import('./useChangelog')
  const changelog = useChangelog()
  await changelog.resolveVersion()
  return changelog
}

describe('useChangelog', () => {
  beforeEach(() => {
    getBundleVersion.mockReset()
  })

  it('shows the OTA entry after the native entry was seen', async () => {
    const { hasUnseenChangelog, currentVersion } = await setup('2.24.1', '2.24.0')
    expect(currentVersion.value).toBe('2.24.1')
    expect(hasUnseenChangelog.value).toBe(true)
  })

  it('stays hidden once the running version was seen', async () => {
    const { hasUnseenChangelog, markChangelogSeen } = await setup('2.24.1', '')
    markChangelogSeen()
    expect(hasUnseenChangelog.value).toBe(false)
  })

  it('stays hidden when the running version has no entry', async () => {
    const { hasUnseenChangelog } = await setup('2.24.2', '2.24.0')
    expect(hasUnseenChangelog.value).toBe(false)
  })
})
