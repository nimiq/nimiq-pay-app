<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { getHistory, getStatus } from '@/lib/walkie-talkie'
import { useLiveChat } from '@/stores/livechat'
import { useLocalWallet } from '@/stores/local-wallet'
import LiveChatIcon from './icons/live-chat.vue'

const livechat = useLiveChat()
const { shown, loading, error, pendingMessageCount, sessionId, lastReadMessageId, messages, lastMessageId, online, conversationEnded } = storeToRefs(livechat)

const userId = useLocalWallet().localAddress.toUserFriendlyAddress().replaceAll(' ', '')

let pollInterval: ReturnType<typeof setInterval> | null = null
let statusPollInterval: ReturnType<typeof setInterval> | null = null

async function pollStatus() {
  try {
    const status = await getStatus(userId)
    online.value = status.online
  }
  catch {
    // Silently ignore polling errors
  }
}

function startStatusPolling() {
  if (statusPollInterval !== null)
    return
  statusPollInterval = setInterval(pollStatus, 60_000)
}

function stopStatusPolling() {
  if (statusPollInterval !== null) {
    clearInterval(statusPollInterval)
    statusPollInterval = null
  }
}

function startPolling() {
  stopPolling()
  if (!sessionId.value)
    return
  const interval = shown.value ? 3000 : 15000
  pollInterval = setInterval(pollMessages, interval)
}

function stopPolling() {
  if (pollInterval !== null) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

async function pollMessages() {
  if (!sessionId.value) {
    stopPolling()
    return
  }
  try {
    const newMessages = await getHistory(userId, sessionId.value, lastMessageId.value)
    if (!newMessages.length)
      return
    lastMessageId.value = newMessages.at(-1)!.id

    // Filter out messages we already have (in case of out-of-order delivery)
    const existingIds = new Set(messages.value.map(m => m.id))
    const uniqueNewMessages = newMessages.filter(m => !existingIds.has(m.id))
    if (!uniqueNewMessages.length)
      return

    if (uniqueNewMessages.some(m => m.sender.startsWith('agent:'))) {
      online.value = true
    }

    if (!shown.value) {
      const agentCount = uniqueNewMessages.filter(m => m.sender.startsWith('agent:')).length
      pendingMessageCount.value += agentCount
    }

    messages.value = [...messages.value, ...uniqueNewMessages]
      .sort((a, b) => a.timestamp === b.timestamp ? 0 : a.timestamp > b.timestamp ? 1 : -1)

    // Support can close the session from Slack; end the chat like a user-initiated close
    if (uniqueNewMessages.some(m => m.sender === 'system' && m.event === 'session_closed')) {
      sessionId.value = ''
      conversationEnded.value = true
    }
  }
  catch {
    // Silently ignore polling errors
  }
}

onMounted(async () => {
  try {
    // Only query for active session when sessionId is not already set (if it is set, then the badge was
    // loaded from the startup-init function and getStatus was already called there)
    if (!sessionId.value) {
      const status = await getStatus(userId)
      online.value = status.online
      sessionId.value = status.session_id
    }

    if (sessionId.value) {
      conversationEnded.value = false
      const history = await getHistory(userId, sessionId.value, '0')
      messages.value = history
      if (history.length > 0) {
        lastMessageId.value = history.at(-1)!.id

        // Count unread agent messages (those received after the user last viewed the chat)
        if (lastReadMessageId.value !== '0') {
          const cutoffIdx = history.findIndex(m => m.id === lastReadMessageId.value)
          if (cutoffIdx >= 0) {
            const unread = history.slice(cutoffIdx + 1).filter(m => m.sender.startsWith('agent:'))
            pendingMessageCount.value = unread.length
          }
        }
      }
    }
  }
  catch {
    error.value = true
  }
  finally {
    loading.value = false
  }

  startStatusPolling()

  if (sessionId.value) {
    startPolling()
  }
})

onUnmounted(() => {
  stopPolling()
  stopStatusPolling()
})

// Adjust polling interval and clear pending count when shown changes
watch(shown, (isShown) => {
  if (isShown) {
    pendingMessageCount.value = 0
    lastReadMessageId.value = lastMessageId.value // mark messages as read
  }
  if (sessionId.value) {
    startPolling()
  }
})

// Reset state when chat is closed after conversation ended
watch(shown, (isShown) => {
  if (!isShown && conversationEnded.value) {
    livechat.reset()
  }
})

// Start/stop polling when session changes
watch(sessionId, (newId) => {
  if (newId) {
    startPolling()
  }
  else {
    stopPolling()
  }
})
</script>

<template>
  <button class="badge flex flex-row items-center gap-1 rounded-full text-white px-3 py-1.5 font-semibold bg-space" @click="shown = !shown">
    <LiveChatIcon class="size-5 text-white" />
    Chat
    <template v-if="pendingMessageCount">
      <div class="absolute top-1 -right-1 rounded-full bg-fire size-3" />
      <div class="absolute top-1 -right-1 rounded-full bg-fire size-3 animate-ping" />
    </template>
  </button>
</template>
