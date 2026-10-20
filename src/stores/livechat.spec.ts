import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  appInfo: vi.fn(),
  deviceInfo: vi.fn(),
  readLogsBase64: vi.fn(),
  sendMessage: vi.fn(),
  startSession: vi.fn(),
  uploadAttachment: vi.fn(),
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

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ readLogsBase64: mocks.readLogsBase64 }),
}))

vi.mock('@/lib/diagnostics', () => ({
  logDiagnostics: vi.fn(async () => {}),
}))

vi.mock('@/lib', () => ({
  isTestnet: true,
}))

vi.mock('@/lib/walkie-talkie', () => ({
  closeSession: vi.fn(),
  getStatus: vi.fn(),
  sendMessage: mocks.sendMessage,
  startSession: mocks.startSession,
  uploadAttachment: mocks.uploadAttachment,
  MAX_ATTACHMENT_SIZE: 10 * 1024 * 1024,
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
    mocks.readLogsBase64.mockReset().mockResolvedValue('bG9ncw==')
    mocks.uploadAttachment.mockReset().mockResolvedValue({ file_id: 'F1' })
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
  it('uploads logs capped at the attachment limit, starting a session if needed', async () => {
    const { useLiveChat } = await import('./livechat')

    await useLiveChat().sendLogs()

    expect(mocks.readLogsBase64).toHaveBeenCalledWith(10 * 1024 * 1024)
    expect(mocks.startSession).toHaveBeenCalledTimes(1)
    expect(mocks.uploadAttachment).toHaveBeenCalledWith(
      'NQ29CGXH84N9BSK4B8TUUPUFGV973YTTFDJ8',
      'session-1',
      expect.stringMatching(/^nimiq-pay-logs-.+\.txt$/),
      'bG9ncw==',
    )
  })

  it('uploads logs to the existing session', async () => {
    const { useLiveChat } = await import('./livechat')
    const livechat = useLiveChat()
    livechat.sessionId = 'session-2'

    await livechat.sendLogs()

    expect(mocks.startSession).not.toHaveBeenCalled()
    expect(mocks.uploadAttachment).toHaveBeenCalledWith(expect.any(String), 'session-2', expect.any(String), 'bG9ncw==')
  })
})
