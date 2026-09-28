<script setup lang="ts">
import { IonButton, IonButtons, IonIcon, IonTitle, IonToolbar } from '@ionic/vue'
import { checkmarkCircle, close, documentTextOutline, send } from 'ionicons/icons'
import { AnimatePresence, motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { useApp } from '@/stores/app'
import { useLiveChat } from '@/stores/livechat'
import ChatConfirmDialog from './ChatConfirmDialog.vue'
import LoadingSpinnerIcon from './icons/loading-spinner.vue'

const livechat = useLiveChat()
const { shown, loading, error, messages, online, conversationEnded } = storeToRefs(livechat)
const { showAnimations } = storeToRefs(useApp())

const inputText = ref('')
const showEndConfirm = ref(false)
const chatEnded = computed(() => conversationEnded.value && messages.value.length > 0)
const messageListRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const sending = ref(false)
const showSendLogsConfirm = ref(false)
const sendingLogs = ref(false)
const sendLogsFailed = ref(false)
const dismissedLogsRequestId = ref('')

// "log"/"logs" as a word, but not "log in" / "log out"
const LOGS_REQUEST = /\blogs?\b(?!\s+(?:in|into|out)\b)/i

// Latest agent message asking for logs, unless logs were attached after it (backend records
// uploads in history as a user message starting with 📎) or the notice was dismissed
const logsRequestId = computed(() => {
  const index = messages.value.findLastIndex(m => m.sender.startsWith('agent:') && LOGS_REQUEST.test(m.content))
  if (index < 0)
    return ''
  const { id } = messages.value[index]
  const attachedAfter = messages.value.slice(index + 1).some(m => m.sender === 'user' && m.content.startsWith('📎'))
  return attachedAfter || id === dismissedLogsRequestId.value ? '' : id
})

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  })
}

watch(messages, scrollToBottom, { deep: true })
watch(shown, (isShown) => {
  if (isShown)
    scrollToBottom()
})

function autoResize() {
  if (!textareaRef.value)
    return
  textareaRef.value.style.height = 'auto'
  textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || sending.value)
    return
  inputText.value = ''
  if (textareaRef.value)
    textareaRef.value.style.height = 'auto'
  sending.value = true
  try {
    await livechat.sendMessage(text)
  }
  finally {
    sending.value = false
  }
}

async function handleSendLogs() {
  showSendLogsConfirm.value = false
  sendingLogs.value = true
  sendLogsFailed.value = false
  try {
    await livechat.sendLogs()
    // Hide the notice right away instead of waiting for the 📎 message to arrive via polling
    dismissedLogsRequestId.value = logsRequestId.value
  }
  catch (e) {
    console.error('Failed to send logs', e)
    sendLogsFailed.value = true
  }
  finally {
    sendingLogs.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

async function confirmEnd() {
  showEndConfirm.value = false
  await livechat.closeSession()
}

function agentName(sender: string): string {
  return sender.startsWith('agent:') ? sender.slice('agent:'.length) : sender
}

function formatTime(timestamp: string): string {
  return new Date(`${timestamp.replace(' ', 'T')}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="overlay" :class="{ visible: shown }">
    <div class="shrink-0 w-6 h-6 ml-24 border-[12px] border-l-transparent border-r-transparent border-t-transparent border-b-white" />
    <div class="bg-white rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 relative">
      <!-- Toolbar -->
      <IonToolbar>
        <IonTitle slot="start" class="font-bold text-2xl tracking-normal">
          <span class="flex items-center gap-2">
            Live Chat
            <span
              class="inline-block size-2 rounded-full"
              :class="online ? 'bg-green-500' : 'bg-neutral-300'"
              :title="online ? $t('Agent online') : $t('Agent offline')"
            />
          </span>
        </IonTitle>
        <IonButtons slot="end">
          <IonButton v-if="!chatEnded" @click.stop="showEndConfirm = true">
            <span class="text-space/60 text-sm font-medium mr-1">{{ $t('End Chat') }}</span>
          </IonButton>
          <IonButton @click.stop="shown = false">
            <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
          </IonButton>
        </IonButtons>
      </IonToolbar>

      <ChatConfirmDialog
        v-if="showEndConfirm"
        :title="$t('End this chat?')"
        :confirm-label="$t('End Chat')"
        confirm-color="danger"
        @cancel="showEndConfirm = false"
        @confirm="confirmEnd"
      />
      <ChatConfirmDialog
        v-if="showSendLogsConfirm"
        :title="$t('Send app logs to support?')"
        :message="$t('Logs help us find the problem. They include your wallet address and transaction details.')"
        :confirm-label="$t('Send')"
        @cancel="showSendLogsConfirm = false"
        @confirm="handleSendLogs"
      />

      <!-- Loading state -->
      <div v-if="loading" class="text-center mb-10 flex flex-row gap-2 h-full items-center justify-center">
        <LoadingSpinnerIcon class="size-6 opacity-50" />
        <span class="text-space/50 text-xl font-semibold">{{ $t('Loading...') }}</span>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="flex-grow flex flex-col items-center justify-center gap-3 p-6 text-center">
        <span class="text-space/50 text-sm">{{ $t('Could not connect to support. Please try again later.') }}</span>
      </div>

      <!-- Chat ended thank-you screen -->
      <div v-else-if="chatEnded" class="flex-grow flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div class="size-14 rounded-full bg-green-500 flex items-center justify-center">
          <IonIcon :icon="checkmarkCircle" class="text-white text-4xl" />
        </div>
        <p class="text-space font-semibold text-base">
          {{ $t('Thanks for reaching out!') }}
        </p>
        <p class="text-space/60 text-sm leading-relaxed">
          {{ $t('We hope your issue was resolved. Close and reopen this chat to start a new conversation.') }}
        </p>
      </div>

      <!-- Normal message list + input (chat in progress) -->
      <template v-else>
        <!-- Message list -->
        <div ref="messageListRef" class="flex-grow overflow-y-auto p-4 flex flex-col gap-3">
          <!-- Empty state -->
          <div v-if="messages.length === 0" class="flex-grow flex items-center justify-center text-space/40 text-sm">
            {{ $t('Start a conversation...') }}
          </div>

          <!-- Messages -->
          <div
            v-for="msg in messages"
            :key="msg.id || `pending-${msg.timestamp}`"
            class="flex flex-col max-w-[80%]"
            :class="msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'"
          >
            <span v-if="msg.sender !== 'user'" class="text-xs text-space/50 mb-1 px-1">
              {{ agentName(msg.sender) }}
            </span>
            <div
              class="rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
              :class="msg.sender === 'user'
                ? 'bg-sky text-white rounded-br-sm'
                : 'bg-neutral-100 text-space rounded-bl-sm'"
            >
              {{ msg.content }}
            </div>
            <span
              class="text-xs mt-1 px-1"
              :class="msg.failed ? 'text-cherry font-medium' : 'text-space/40'"
            >
              <template v-if="msg.id">{{ formatTime(msg.timestamp) }}</template>
              <template v-else-if="msg.failed">{{ $t('Failed to send') }}</template>
              <template v-else>Sending...</template>
            </span>
          </div>
        </div>

        <p v-if="sendLogsFailed" class="text-xs text-cherry font-medium px-4 pb-2">
          {{ $t('Failed to send logs') }}
        </p>

        <AnimatePresence>
          <motion.div
            v-if="logsRequestId && !sendingLogs"
            key="logs-request"
            class="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-sky/10 py-1 pl-3"
            role="status"
            :initial="{ opacity: 0, y: 8 }"
            :animate="{ opacity: 1, y: 0 }"
            :exit="{ opacity: 0, y: 8 }"
            :transition="{ duration: showAnimations ? 0.25 : 0, ease: [0.16, 1, 0.3, 1] }"
          >
            <IonIcon :icon="documentTextOutline" class="shrink-0 text-xl text-sky" aria-hidden="true" />
            <p class="flex-1 text-sm leading-snug text-space">
              {{ $t('Support needs your app logs to look into this.') }}
            </p>
            <button
              class="shrink-0 rounded-full bg-space px-4 py-2 text-sm font-bold text-white active:bg-space/80"
              @click="showSendLogsConfirm = true"
            >
              {{ $t('Attach logs') }}
            </button>
            <button
              class="flex size-11 shrink-0 items-center justify-center text-space/40"
              :aria-label="$t('Dismiss')"
              @click="dismissedLogsRequestId = logsRequestId"
            >
              <IonIcon :icon="close" class="text-lg" aria-hidden="true" />
            </button>
          </motion.div>
        </AnimatePresence>

        <!-- Input area -->
        <div class="border-t border-neutral-100 p-3 flex gap-2 items-end">
          <!-- Same height as the single-line textarea, so the icon lines up with its last line -->
          <div class="h-12 flex items-center shrink-0">
            <IonButton
              fill="clear"
              shape="round"
              :disabled="sendingLogs"
              :title="$t('Send logs')"
              class="m-0"
              @click="showSendLogsConfirm = true"
            >
              <LoadingSpinnerIcon v-if="sendingLogs" class="size-5 opacity-50" />
              <IonIcon v-else slot="icon-only" :icon="documentTextOutline" />
            </IonButton>
          </div>
          <textarea
            ref="textareaRef"
            v-model="inputText"
            rows="1"
            class="flex-grow resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-sky transition-colors max-h-32 min-h-12"
            :placeholder="$t('Type a message...')"
            @input="autoResize"
            @keydown="onKeydown"
          />
          <IonButton
            fill="solid"
            shape="round"
            :disabled="!inputText.trim() || sending"
            class="shrink-0 h-0"
            @click="handleSend"
          >
            <IonIcon slot="icon-only" :icon="send" />
          </IonButton>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  top: -9999px;
  left: -9999px;
  bottom: 0.5rem;
  right: 0.5rem;
  width: calc(100% - 1rem);
  height: calc(100% - var(--top-margin) - 0.5rem);
  visibility: hidden;
  display: flex;
  flex-direction: column;
  z-index: 1000;
}
.overlay.visible {
  top: var(--top-margin);
  left: 0.5rem;
  visibility: visible;
}
</style>
