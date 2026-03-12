<script setup lang="ts">
import { getHistory, getStatus } from '@/lib/walkie-talkie'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { useLiveChat } from '@/stores/livechat'
import { useLocalWallet } from '@/stores/local-wallet'
import LiveChatIcon from './icons/live-chat.vue'

const livechat = useLiveChat()
const { shown, loading, pendingMessageCount, sessionId, messages, lastMessageId, online, conversationEnded } = storeToRefs(livechat)

const userId = useLocalWallet().localAddress.toUserFriendlyAddress()

let pollInterval: ReturnType<typeof setInterval> | null = null

function startPolling() {
  stopPolling()
  if (!sessionId.value) return
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
    if (newMessages.length === 0) return

    if (!shown.value) {
      const agentCount = newMessages.filter(m => m.sender.startsWith('agent:')).length
      pendingMessageCount.value += agentCount
    }

    messages.value = [...messages.value, ...newMessages]
    lastMessageId.value = newMessages[newMessages.length - 1].id
  }
  catch {
    // Silently ignore polling errors
  }
}

onMounted(async () => {
  try {
    const status = await getStatus(userId)
    online.value = status.online
    sessionId.value = status.session_id

    if (status.session_id) {
      const history = await getHistory(userId, status.session_id, '0')
      messages.value = history
      if (history.length > 0) {
        lastMessageId.value = history[history.length - 1].id
        conversationEnded.value = false
      }
    }
  }
  finally {
    loading.value = false
  }

  if (sessionId.value) {
    startPolling()
  }
})

onUnmounted(() => {
  stopPolling()
})

// Adjust polling interval and clear pending count when shown changes
watch(shown, (isShown) => {
  if (isShown) {
    pendingMessageCount.value = 0
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
