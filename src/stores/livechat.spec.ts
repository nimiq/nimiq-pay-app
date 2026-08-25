import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  appInfo: vi.fn(),
  deviceInfo: vi.fn(),
  sendMessage: vi.fn(),
  startSession: vi.fn(),
  state: {
    activeAsset: 'USDT',
    language: 'es',
    walletAddress: 'NQ29 CGXH 84N9 BSK4 B8TU UPUF GV97 3YTT FDJ8',
  },
}))

vi.mock('@capacitor/app', () => ({
  App: { getInfo: mocks.appInfo },
}))

vi.mock('@capacitor/device', () => ({
  Device: { getInfo: mocks.deviceInfo },
}))

vi.mock('@vueuse/core', () => ({
  useStorageAsync: <T>(_key: string, defaultValue: T) => ref(defaultValue),
}))

vi.mock('@/lib', () => ({
  isTestnet: true,
}))

vi.mock('@/lib/walkie-talkie', () => ({
  closeSession: vi.fn(),
  getStatus: vi.fn(),
  sendMessage: mocks.sendMessage,
  startSession: mocks.startSession,
}))

vi.mock('./app', () => ({
  kvPreferences: vi.fn(),
  useApp: () => ({
    activeAsset: mocks.state.activeAsset,
    language: mocks.state.language,
  }),
}))

vi.mock('./local-wallet', () => ({
  useLocalWallet: () => ({
    localAddress: {
      toUserFriendlyAddress: () => mocks.state.walletAddress,
    },
  }),
}))

describe('useLiveChat support context', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.state.activeAsset = 'USDT'
    mocks.state.language = 'es'
    mocks.state.walletAddress = 'NQ29 CGXH 84N9 BSK4 B8TU UPUF GV97 3YTT FDJ8'
    mocks.appInfo.mockReset().mockResolvedValue({
      build: '219010',
      id: 'com.nimiq.pay',
      name: 'Nimiq Pay',
      version: '2.19.1',
    })
    mocks.deviceInfo.mockReset().mockResolvedValue({
      isVirtual: false,
      manufacturer: 'Apple',
      model: 'iPhone17,2',
      operatingSystem: 'ios',
      osVersion: '26.0',
      platform: 'ios',
      webViewVersion: '619.1',
    })
    mocks.startSession.mockReset().mockResolvedValue({ session_id: 'session-1' })
    mocks.sendMessage.mockReset().mockResolvedValue({ message_id: 'message-1' })
  })

  it('starts new sessions with a shortened name and full support context', async () => {
    const { useLiveChat } = await import('./livechat')

    await useLiveChat().sendMessage('Help me')

    expect(mocks.startSession).toHaveBeenCalledWith(
      'NQ29CGXH84N9BSK4B8TUUPUFGV973YTTFDJ8',
      '[Name: NQ29...FDJ8 | Address: NQ29 CGXH 84N9 BSK4 B8TU UPUF GV97 3YTT FDJ8 | App Version: 2.19.1 | Build: 219010 | Platform: ios | OS: ios 26.0 | Device: Apple iPhone17,2 | Network: testnet | Asset: USDT | Language: es]',
    )
  })

  it('starts chat when native metadata is unavailable', async () => {
    mocks.appInfo.mockRejectedValue(new Error('App info unavailable'))
    mocks.deviceInfo.mockRejectedValue(new Error('Device info unavailable'))
    mocks.state.activeAsset = 'NIM'
    mocks.state.language = 'en'

    const { useLiveChat } = await import('./livechat')

    await useLiveChat().sendMessage('Help me')

    expect(mocks.startSession).toHaveBeenCalledWith(
      'NQ29CGXH84N9BSK4B8TUUPUFGV973YTTFDJ8',
      '[Name: NQ29...FDJ8 | Address: NQ29 CGXH 84N9 BSK4 B8TU UPUF GV97 3YTT FDJ8 | App Version: unknown | Build: unknown | Platform: unknown | OS: unknown | Device: unknown | Network: testnet | Asset: NIM | Language: en]',
    )
  })
})
