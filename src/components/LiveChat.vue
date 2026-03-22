<script setup lang="ts">
import { IonButton, IonButtons, IonIcon, IonTitle, IonToolbar } from '@ionic/vue'
import { checkmarkCircle, close, send } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { useLiveChat } from '@/stores/livechat'
import LoadingSpinnerIcon from './icons/loading-spinner.vue'

const livechat = useLiveChat()
const { shown, loading, error, messages, online, conversationEnded } = storeToRefs(livechat)

const inputText = ref('')
const showEndConfirm = ref(false)
const chatEnded = computed(() => conversationEnded.value && messages.value.length > 0)
const messageListRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const sending = ref(false)

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
    <div class="w-6 h-6 -mt-6 ml-24 border-[12px] border-l-transparent border-r-transparent border-t-transparent border-b-white" />
    <div class="bg-white rounded-2xl overflow-hidden flex flex-col h-full relative">
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

      <!-- Confirmation dialog overlay (absolute, always on top) -->
      <div v-if="showEndConfirm" class="absolute inset-0 bg-black/30 flex items-center justify-center z-10 rounded-2xl p-6">
        <div class="bg-white rounded-2xl p-6 flex flex-col gap-4 shadow-lg w-full max-w-xs">
          <p class="text-space font-semibold text-base text-center">{{ $t('End this chat?') }}</p>
          <div class="flex gap-3">
            <IonButton fill="clear" expand="block" class="flex-1 h-0" @click.stop="showEndConfirm = false">
              {{ $t('Cancel') }}
            </IonButton>
            <IonButton fill="solid" expand="block" class="flex-1 h-0" color="danger" @click.stop="confirmEnd">
              {{ $t('End Chat') }}
            </IonButton>
          </div>
        </div>
      </div>

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
        <p class="text-space font-semibold text-base">{{ $t('Thanks for reaching out!') }}</p>
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
            <span class="text-xs text-space/40 mt-1 px-1">{{ msg.id ? formatTime(msg.timestamp) : 'Sending...' }}</span>
          </div>
        </div>

        <!-- Input area -->
        <div class="border-t border-neutral-100 p-3 flex gap-2 items-end">
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
  --top-margin: 65px;
  position: fixed;
  top: -9999px;
  left: -9999px;
  bottom: 0.5rem;
  right: 0.5rem;
  width: calc(100% - 1rem);
  height: calc(100% - var(--top-margin) - 0.5rem);
  visibility: hidden;
  z-index: 1000;
}
.overlay.visible {
  top: var(--top-margin);
  left: 0.5rem;
  visibility: visible;
}
</style>
