<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useLiveChat } from '@/stores/livechat'
import { useLocalWallet } from '@/stores/local-wallet'
import { useNaka } from '@/stores/naka'
import LiveChatIcon from './icons/live-chat.vue'

const { registration, card } = storeToRefs(useNaka())
const { shown, loading, pendingMessageCount } = storeToRefs(useLiveChat())

onMounted(async () => {
  shown.value = true
  await loadScript()

  const readyPromise = new Promise((resolve) => {
    function onReady() {
      document.removeEventListener('chatlio.ready', onReady)
      resolve(true)
    }
    document.addEventListener('chatlio.ready', onReady)
  })

  await new Promise((resolve) => {
    function check() {
      if (window._chatlio) {
        resolve(true)
      }
      else {
        loading.value = true
        setTimeout(check, 50)
      }
    }
    check()
  })

  await readyPromise
  loading.value = false

  await identify()

  document.addEventListener('chatlio.messageReceived', onMessageReceived)
  document.addEventListener('chatlio.conversationEnded', onConversationEnded)
})

onUnmounted(() => {
  document.removeEventListener('chatlio.messageReceived', onMessageReceived)
  document.removeEventListener('chatlio.conversationEnded', onConversationEnded)
})

async function loadScript() {
  if (document.getElementById('chatlio-widget-script')) {
    return
  }

  const script = document.createElement('script')
  script.id = 'chatlio-widget-script'
  script.src = 'https://js.chatlio.com/widget.js'
  script.async = true
  const loadPromise = new Promise((resolve) => {
    script.onload = () => resolve(true)
  })
  document.body.appendChild(script)
  return loadPromise
}

async function identify() {
  window._chatlio.identify(useLocalWallet().localAddress.toUserFriendlyAddress(), {
    'name': registration.value?.nakaIdentification?.firstName?.split(' ')[0],
    'KYC Status': registration.value?.nakaIdentification?.status || '-',
    'Card PAN': card.value?.maskedPan || '-',
    'Card Status': card.value?.statusId || '-',
    'Card Lock': card.value?.lockLevel || 'no',
  })
}

// Pending message count logic
function onMessageReceived() {
  if (shown.value)
    return
  pendingMessageCount.value += 1
}

// Reset pending message count when chat is opened
watch(shown, (isShown) => {
  if (isShown) {
    pendingMessageCount.value = 0
  }
})

// Conversation end logic
const conversationEnded = ref(false)

function onConversationEnded() {
  conversationEnded.value = true
}

// Reset state when chat is closed after conversation ended
watch(shown, (isShown) => {
  if (!isShown && conversationEnded.value) {
    // This unmounts this badge component by setting enabled = false
    useLiveChat().reset()
  }
})

declare global {
  interface Window {
    _chatlio: {
      identify: (userId: string, traits: Record<string, any>) => void
      isShown: () => boolean | undefined
      show: (options?: { expanded: boolean }) => void
      open: () => void
      reset: () => void
    }
  }
}
</script>

<template>
  <button class="badge flex flex-row items-center gap-1 rounded-full text-white px-3 py-1.5 font-semibold" :class="{ 'bg-fire': pendingMessageCount > 0, 'bg-space': pendingMessageCount === 0 }" @click="shown = !shown">
    <LiveChatIcon class="size-5 text-white" />
    Chat
    <chatlio-widget widgetid="7aa22465-fd98-4f3a-7621-c7a124a3a8cf" widgettype="inline" />
  </button>
</template>
