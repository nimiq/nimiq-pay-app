import type { WtMessage } from '@/lib/walkie-talkie'
import { useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { closeSession as apiCloseSession, sendMessage as apiSendMessage, startSession as apiStartSession, getStatus } from '@/lib/walkie-talkie'
import { kvPreferences } from './app'
import { useLocalWallet } from './local-wallet'
import { useNaka } from './naka'

export const useLiveChat = defineStore('livechat', () => {
  const enabled = ref(false)
  const shown = ref(false)
  const loading = ref(true)
  const error = ref(false)
  const pendingMessageCount = ref(0)

  // Walkie-Talkie session state
  // sessionId is persisted so we know on restart whether to check for an active session
  const sessionId = useStorageAsync('livechat-sessionId', '', kvPreferences())
  // lastReadMessageId tracks the last message the user saw, for unread count on restart
  const lastReadMessageId = useStorageAsync('livechat-lastReadMessageId', '0', kvPreferences())
  const messages = ref<WtMessage[]>([])
  const lastMessageId = ref('0')
  const online = ref(false)

  /**
   * If true, the chat badge is removed when overlay is closed.
   * True initially (no session), false after first message, true again after closeSession.
   */
  const conversationEnded = ref(true)

  function reset() {
    enabled.value = false
    shown.value = false
    loading.value = true
    error.value = false
    pendingMessageCount.value = 0
    sessionId.value = ''
    lastReadMessageId.value = '0'
    messages.value = []
    lastMessageId.value = '0'
    online.value = false
    conversationEnded.value = true
  }

  /**
   * Called on app startup. If a session was persisted, verify it still exists on the backend
   * and restore the enabled state so the badge appears. Does nothing if no session was persisted.
   */
  async function initFromBackground() {
    await new Promise(resolve => setTimeout(resolve, 500)) // Wait a bit for the async storage to have been read
    console.warn('Initializing live chat from background', sessionId)
    if (!sessionId.value)
      return

    const userId = useLocalWallet().localAddress.toUserFriendlyAddress().replaceAll(' ', '')
    try {
      const status = await getStatus(userId)
      online.value = status.online
      if (status.session_id) {
        enabled.value = true
        sessionId.value = status.session_id
        conversationEnded.value = false
      }
      else {
        // Session no longer exists on the backend — clean up
        sessionId.value = ''
      }
    }
    catch {
      // Silently ignore — badge stays hidden
    }
  }

  function buildTraitsPreamble(): string {
    const { registration, card } = useNaka()
    const name = registration?.nakaIdentification?.firstName?.split(' ')[0] || '-'
    const kyc = registration?.nakaIdentification?.status || '-'
    const pan = card?.maskedPan || '-'
    const cardStatus = card?.statusId || '-'
    const cardLock = card?.lockLevel ? 'yes' : 'no'
    return `[Name: ${name} | KYC: ${kyc} | Card: ${pan} | Card Status: ${cardStatus} | Card Lock: ${cardLock}]`
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed)
      return

    const userId = useLocalWallet().localAddress.toUserFriendlyAddress().replaceAll(' ', '')

    // Optimistically append user message
    const message = {
      id: '',
      sender: 'user',
      content: trimmed,
      timestamp: new Date().toISOString().substring(0, 19).replace('T', ' '), // Walkie-Talkie format is "YYYY-MM-DD HH:MM:SS"
    }
    messages.value.push(message)
    conversationEnded.value = false

    if (!sessionId.value) {
      const preamble = buildTraitsPreamble()
      const result = await apiStartSession(userId, preamble)
      sessionId.value = result.session_id
      const { message_id } = await apiSendMessage(userId, result.session_id, trimmed)
      messages.value.find(m => !m.id && m.timestamp === message.timestamp)!.id = message_id
    }
    else {
      const { message_id } = await apiSendMessage(userId, sessionId.value, trimmed)
      messages.value.find(m => !m.id && m.timestamp === message.timestamp)!.id = message_id
    }
  }

  async function closeSession() {
    if (!sessionId.value)
      return
    const userId = useLocalWallet().localAddress.toUserFriendlyAddress().replaceAll(' ', '')
    await apiCloseSession(userId, sessionId.value)
    sessionId.value = ''
    conversationEnded.value = true
  }

  return {
    enabled,
    shown,
    loading,
    error,
    pendingMessageCount,
    sessionId,
    lastReadMessageId,
    messages,
    lastMessageId,
    online,
    conversationEnded,
    reset,
    sendMessage,
    closeSession,
    initFromBackground,
  }
})
