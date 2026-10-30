import type { WtMessage } from '@/lib/walkie-talkie'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive, ref } from 'vue'

const messages = ref<WtMessage[]>([])
const conversationEnded = ref(false)
const sessionId = ref('')
const sendLogs = vi.fn()

vi.mock('@ionic/vue', () => {
  const passthrough = (tag: string) => defineComponent({
    template: `<${tag}><slot /></${tag}>`,
  })

  return {
    IonButton: passthrough('button'),
    IonButtons: passthrough('div'),
    IonIcon: passthrough('span'),
    IonTitle: passthrough('div'),
    IonToolbar: passthrough('div'),
  }
})

vi.mock('ionicons/icons', () => ({
  checkmarkCircle: 'checkmarkCircle',
  close: 'close',
  documentTextOutline: 'documentTextOutline',
  send: 'send',
}))

vi.mock('motion-v', () => ({
  AnimatePresence: defineComponent({ template: '<slot />' }),
  motion: { div: defineComponent({ template: '<div><slot /></div>' }) },
}))

vi.mock('./icons/loading-spinner.vue', () => ({
  default: defineComponent({ template: '<span />' }),
}))

vi.mock('@/stores/app', () => ({
  useApp: () => reactive({ showAnimations: ref(false) }),
}))

vi.mock('@/stores/livechat', () => ({
  useLiveChat: () => reactive({
    shown: ref(true),
    loading: ref(false),
    error: ref(false),
    messages,
    online: ref(true),
    conversationEnded,
    sessionId,
    sendLogs,
    sendMessage: vi.fn(),
    closeSession: vi.fn(),
  }),
}))

function message(id: string, sender: string, content: string, event?: string): WtMessage {
  return { id, sender, event, content, timestamp: `2026-09-28 10:00:0${id}` }
}

async function mountChat() {
  const { default: LiveChat } = await import('./LiveChat.vue')
  const wrapper = mount(LiveChat, {
    global: { mocks: { $t: (value: string) => value } },
  })
  await flushPromises()
  return wrapper
}

function button(wrapper: Awaited<ReturnType<typeof mountChat>>, text: string) {
  return wrapper.findAll('button').find(b => b.text() === text)!
}

describe('liveChat logs request notice', () => {
  beforeEach(() => {
    messages.value = []
    conversationEnded.value = false
    sendLogs.mockReset().mockResolvedValue(undefined)
  })

  it('asks for logs when an agent mentions them', async () => {
    messages.value = [message('1', 'agent:Ana', 'Could you send us your logs?')]

    const wrapper = await mountChat()

    expect(wrapper.text()).toContain('Attach logs')
  })

  it.each([
    'Please log in again',
    'Try to log out and back in',
    'I read the blog post',
  ])('ignores agent message "%s"', async (content) => {
    messages.value = [message('1', 'agent:Ana', content)]

    const wrapper = await mountChat()

    expect(wrapper.text()).not.toContain('Attach logs')
  })

  it('ignores the user mentioning logs', async () => {
    messages.value = [message('1', 'user', 'Where are my logs?')]

    const wrapper = await mountChat()

    expect(wrapper.text()).not.toContain('Attach logs')
  })

  it('hides once logs were attached after the request', async () => {
    messages.value = [
      message('1', 'agent:Ana', 'Please attach the log'),
      message('2', 'user', '📎 nimiq-pay-logs.txt'),
    ]

    const wrapper = await mountChat()

    expect(wrapper.text()).not.toContain('Attach logs')
  })

  it('asks again for a newer request after an attachment', async () => {
    messages.value = [
      message('1', 'agent:Ana', 'Please attach the log'),
      message('2', 'user', '📎 nimiq-pay-logs.txt'),
      message('3', 'agent:Ana', 'Thanks, one more set of logs please'),
    ]

    const wrapper = await mountChat()

    expect(wrapper.text()).toContain('Attach logs')
  })

  it('sends logs only after confirming, then hides', async () => {
    messages.value = [message('1', 'agent:Ana', 'Send logs please')]
    const wrapper = await mountChat()

    await button(wrapper, 'Attach logs').trigger('click')
    expect(sendLogs).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Send app logs to support?')

    await button(wrapper, 'Send').trigger('click')
    await flushPromises()

    expect(sendLogs).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).not.toContain('Attach logs')
  })

  it('hides when dismissed', async () => {
    messages.value = [message('1', 'agent:Ana', 'Send logs please')]
    const wrapper = await mountChat()

    await wrapper.find('button[aria-label="Dismiss"]').trigger('click')

    expect(wrapper.text()).not.toContain('Attach logs')
  })
})

describe('liveChat session end', () => {
  beforeEach(() => {
    messages.value = []
    conversationEnded.value = false
    sessionId.value = ''
  })

  it('keeps the history and input when support closes the session', async () => {
    messages.value = [
      message('1', 'agent:Ana', 'Fixed, please send logs if it happens again'),
      message('2', 'system', 'Session closed by support.', 'session_closed'),
    ]
    conversationEnded.value = true
    sessionId.value = 'session-1'

    const wrapper = await mountChat()

    expect(wrapper.text()).toContain('Fixed, please send logs if it happens again')
    expect(wrapper.text()).toContain('Session closed')
    expect(wrapper.text()).not.toContain('Session closed by support.')
    expect(wrapper.text()).not.toContain('Thanks for reaching out!')
    expect(wrapper.text()).not.toContain('Attach logs')
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('button[title="Send logs"]').exists()).toBe(false)
  })

  it('shows the thank-you screen when the user ends the chat', async () => {
    messages.value = [message('1', 'agent:Ana', 'Hello!')]
    conversationEnded.value = true

    const wrapper = await mountChat()

    expect(wrapper.text()).toContain('Thanks for reaching out!')
    expect(wrapper.find('textarea').exists()).toBe(false)
  })
})

describe('liveChat send logs button', () => {
  beforeEach(() => {
    messages.value = []
    conversationEnded.value = false
    sessionId.value = ''
  })

  it('is hidden before the first message started a session', async () => {
    const wrapper = await mountChat()

    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('button[title="Send logs"]').exists()).toBe(false)
  })

  it('shows once a session exists', async () => {
    messages.value = [message('1', 'user', 'Help me')]
    sessionId.value = 'session-1'

    const wrapper = await mountChat()

    expect(wrapper.find('button[title="Send logs"]').exists()).toBe(true)
  })
})
