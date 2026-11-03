import type { WtMessage } from '@/lib/walkie-talkie'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive, ref } from 'vue'

const mocks = vi.hoisted(() => ({
  getHistory: vi.fn(),
  getStatus: vi.fn(),
}))

const state = {
  shown: ref(true),
  sessionId: ref(''),
  messages: ref<WtMessage[]>([]),
  lastMessageId: ref('0'),
  conversationEnded: ref(false),
}

vi.mock('@/lib/walkie-talkie', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/walkie-talkie')>(),
  getHistory: mocks.getHistory,
  getStatus: mocks.getStatus,
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({ localAddress: { toUserFriendlyAddress: () => 'NQ00 TEST' } }),
}))

vi.mock('@/stores/livechat', () => ({
  useLiveChat: () => reactive({
    ...state,
    loading: ref(true),
    error: ref(false),
    pendingMessageCount: ref(0),
    lastReadMessageId: ref('0'),
    online: ref(false),
    reset: vi.fn(),
  }),
}))

vi.mock('./icons/live-chat.vue', () => ({
  default: defineComponent({ template: '<span />' }),
}))

function message(id: string, sender: string, content: string, event?: string): WtMessage {
  return { id, sender, event, content, timestamp: `2026-10-10 10:00:0${id}` }
}

describe('liveChatBadge polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    state.shown.value = true
    state.sessionId.value = ''
    state.messages.value = []
    state.lastMessageId.value = '0'
    state.conversationEnded.value = false
    mocks.getStatus.mockReset().mockResolvedValue({ session_id: 'session-1', online: true })
    mocks.getHistory.mockReset().mockResolvedValueOnce([message('1', 'user', 'Hi')])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ends the chat but keeps the session when support closes it', async () => {
    const { default: LiveChatBadge } = await import('./LiveChatBadge.vue')
    mount(LiveChatBadge, { global: { mocks: { $t: (value: string) => value } } })
    await flushPromises()

    mocks.getHistory.mockResolvedValueOnce([message('2', 'system', 'Session closed by support.', 'session_closed')])
    await vi.advanceTimersByTimeAsync(3000)

    expect(state.conversationEnded.value).toBe(true)
    expect(state.sessionId.value).toBe('session-1')

    // Polling stops with the session
    await vi.advanceTimersByTimeAsync(15_000)
    expect(mocks.getHistory).toHaveBeenCalledTimes(2)
  })

  it('keeps the chat going for other messages', async () => {
    const { default: LiveChatBadge } = await import('./LiveChatBadge.vue')
    mount(LiveChatBadge, { global: { mocks: { $t: (value: string) => value } } })
    await flushPromises()

    mocks.getHistory.mockResolvedValueOnce([message('2', 'agent:Ana', 'Hello!')])
    await vi.advanceTimersByTimeAsync(3000)

    expect(state.conversationEnded.value).toBe(false)
    expect(state.sessionId.value).toBe('session-1')
  })
})

describe('liveChatBadge restored session', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    state.shown.value = false
    state.sessionId.value = 'session-1'
    state.messages.value = []
    state.lastMessageId.value = '0'
    state.conversationEnded.value = false
    mocks.getStatus.mockReset()
    mocks.getHistory.mockReset().mockResolvedValue([
      message('1', 'agent:Ana', 'Fixed!'),
      message('2', 'system', 'Session closed by support.', 'session_closed'),
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a session support closed as ended without polling', async () => {
    const { default: LiveChatBadge } = await import('./LiveChatBadge.vue')
    mount(LiveChatBadge, { global: { mocks: { $t: (value: string) => value } } })
    await flushPromises()

    expect(state.conversationEnded.value).toBe(true)
    expect(state.messages.value).toHaveLength(2)

    state.shown.value = true
    await vi.advanceTimersByTimeAsync(15_000)
    expect(mocks.getHistory).toHaveBeenCalledTimes(1)
  })
})
