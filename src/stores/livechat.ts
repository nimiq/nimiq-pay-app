import type { WtMessage } from '@/lib/walkie-talkie'
import { App } from '@capacitor/app'
import { Device } from '@capacitor/device'
import { useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { isTestnet } from '@/lib'
import { logDiagnostics } from '@/lib/diagnostics'
import { closeSession as apiCloseSession, sendMessage as apiSendMessage, startSession as apiStartSession, uploadAttachment as apiUploadAttachment, getHistory, getStatus, isSessionClosed, MAX_ATTACHMENT_SIZE } from '@/lib/walkie-talkie'
import { kvPreferences, useApp } from './app'
import { useLocalWallet } from './local-wallet'

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
   * A session support closed is kept until the user has seen it, which resets the chat on close.
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
      else if (isSessionClosed(await getHistory(userId, sessionId.value, '0'))) {
        enabled.value = true
        conversationEnded.value = true
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

  async function buildSupportPreamble(walletAddress: string): Promise<string> {
    const { activeAsset, language } = useApp()
    const compactAddress = walletAddress.replaceAll(' ', '')
    const name = `${compactAddress.slice(0, 4)}...${compactAddress.slice(-4)}`
    const [appInfoResult, deviceInfoResult] = await Promise.allSettled([
      App.getInfo(),
      Device.getInfo(),
    ])
    const appInfo = appInfoResult.status === 'fulfilled' ? appInfoResult.value : undefined
    const deviceInfo = deviceInfoResult.status === 'fulfilled' ? deviceInfoResult.value : undefined
    const os = deviceInfo ? `${deviceInfo.operatingSystem} ${deviceInfo.osVersion}`.trim() : 'unknown'
    const device = deviceInfo ? [deviceInfo.manufacturer, deviceInfo.model].filter(Boolean).join(' ') || 'unknown' : 'unknown'

    return `[Name: ${name} | Address: ${walletAddress} | App Version: ${appInfo?.version || 'unknown'} | Build: ${appInfo?.build || 'unknown'} | Platform: ${deviceInfo?.platform || 'unknown'} | OS: ${os || 'unknown'} | Device: ${device} | Network: ${isTestnet ? 'testnet' : 'mainnet'} | Asset: ${activeAsset} | Language: ${language}]`
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed)
      return

    const walletAddress = useLocalWallet().localAddress.toUserFriendlyAddress()
    const userId = walletAddress.replaceAll(' ', '')

    // Optimistically append user message
    const message: WtMessage = {
      id: '',
      sender: 'user',
      content: trimmed,
      timestamp: new Date().toISOString().substring(0, 19).replace('T', ' '), // Walkie-Talkie format is "YYYY-MM-DD HH:MM:SS"
    }
    messages.value.push(message)
    conversationEnded.value = false

    // Note: we cannot mutate `message` directly — Vue wraps the object in a reactive
    // proxy on push, so the local reference is stale. Look it up from the array instead.
    const findPending = () => messages.value.find(m => !m.id && !m.failed && m.timestamp === message.timestamp)!

    try {
      const { message_id } = await apiSendMessage(userId, await ensureSession(walletAddress, userId), trimmed)
      findPending().id = message_id
    }
    catch (e) {
      console.error('Failed to send live chat message', e)
      findPending().failed = true
    }
  }

  async function ensureSession(walletAddress: string, userId: string) {
    if (!sessionId.value) {
      const preamble = await buildSupportPreamble(walletAddress)
      const result = await apiStartSession(userId, preamble)
      sessionId.value = result.session_id
    }
    return sessionId.value
  }

  /** Uploads the app logs to the support thread. The backend adds a 📎 message to history, picked up by polling. */
  async function sendLogs() {
    const walletAddress = useLocalWallet().localAddress.toUserFriendlyAddress()
    const userId = walletAddress.replaceAll(' ', '')
    const [session, content] = await Promise.all([
      ensureSession(walletAddress, userId),
      logDiagnostics().then(() => useLogger().readLogsBase64(MAX_ATTACHMENT_SIZE)),
    ])
    const date = new Date().toISOString().substring(0, 19).replaceAll(':', '-')
    await apiUploadAttachment(userId, session, `nimiq-pay-logs-${date}.txt`, content)
    conversationEnded.value = false
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
    sendLogs,
    closeSession,
    initFromBackground,
  }
})
