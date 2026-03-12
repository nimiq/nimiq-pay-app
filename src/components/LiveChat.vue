<script setup lang="ts">
import { IonButton, IonButtons, IonIcon, IonTitle, IonToolbar } from '@ionic/vue'
import { close, send } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { nextTick, ref, watch } from 'vue'
import { useLiveChat } from '@/stores/livechat'
import LoadingSpinnerIcon from './icons/loading-spinner.vue'

const livechat = useLiveChat()
const { shown, loading, messages, online } = storeToRefs(livechat)

const inputText = ref('')
const messageListRef = ref<HTMLElement | null>(null)
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
  if (isShown) scrollToBottom()
})

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || sending.value) return
  inputText.value = ''
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

function agentName(sender: string): string {
  return sender.startsWith('agent:') ? sender.slice('agent:'.length) : sender
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="overlay" :class="{ visible: shown }">
    <div class="w-6 h-6 -mt-6 ml-24 border-[12px] border-l-transparent border-r-transparent border-t-transparent border-b-white" />
    <div class="bg-white rounded-2xl overflow-hidden flex flex-col h-full">
      <!-- Toolbar -->
      <IonToolbar>
        <IonTitle slot="start" class="font-bold text-2xl tracking-normal flex items-center gap-2">
          Live Chat
          <span
            class="inline-block size-2 rounded-full ml-1"
            :class="online ? 'bg-green' : 'bg-neutral-300'"
            :title="online ? $t('Agent online') : $t('Agent offline')"
          />
        </IonTitle>
        <IonButtons slot="end">
          <IonButton @click.stop="livechat.closeSession()">
            <span class="text-space/60 text-sm font-medium mr-1">{{ $t('End') }}</span>
          </IonButton>
          <IonButton @click.stop="shown = false">
            <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
          </IonButton>
        </IonButtons>
      </IonToolbar>

      <!-- Loading state -->
      <div v-if="loading" class="text-center mb-10 flex flex-row gap-2 h-full items-center justify-center">
        <LoadingSpinnerIcon class="size-6 opacity-50" />
        <span class="text-space/50 text-xl font-semibold">{{ $t('Loading...') }}</span>
      </div>

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
            :key="msg.id"
            class="flex flex-col max-w-[80%]"
            :class="msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'"
          >
            <span v-if="msg.sender !== 'user'" class="text-xs text-space/50 mb-1 px-1">
              {{ agentName(msg.sender) }}
            </span>
            <div
              class="rounded-2xl px-3 py-2 text-sm leading-relaxed"
              :class="msg.sender === 'user'
                ? 'bg-blue text-white rounded-br-sm'
                : 'bg-neutral-100 text-space rounded-bl-sm'"
            >
              {{ msg.content }}
            </div>
            <span class="text-xs text-space/40 mt-1 px-1">{{ formatTime(msg.timestamp) }}</span>
          </div>
        </div>

        <!-- Input area -->
        <div class="border-t border-neutral-100 p-3 flex gap-2 items-end">
          <textarea
            v-model="inputText"
            rows="1"
            class="flex-grow resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue transition-colors max-h-32"
            :placeholder="$t('Type a message...')"
            @keydown="onKeydown"
          />
          <IonButton
            fill="solid"
            shape="round"
            :disabled="!inputText.trim() || sending"
            class="shrink-0"
            @click="handleSend"
          >
            <IonIcon :icon="send" slot="icon-only" />
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
