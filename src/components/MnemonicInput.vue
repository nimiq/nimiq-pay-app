<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import type { PropType, Ref } from 'vue'

defineProps({
  recoveryWords: {
    type: Array as PropType<string[]>,
    default: () => Array.from({ length: 12 }).fill(''),
  },
})

const emit = defineEmits<{
  (e: 'loginWords', words: string[]): void
}>()

const loginWords: Ref<string[]> = ref([])

watchEffect(() => emit('loginWords', loginWords.value))
</script>

<template>
  <div class="grid grid-cols-3 gap-2">
    <input
      v-for="(word, i) in recoveryWords"
      :tabindex="recoveryWords.length - i"
      :key="word + i" class="lowercase"
      type="text"
      :value="word"
      :disabled="!!word"
      :placeholder="(i + 1).toString().padStart(2, '0')"
      autocomplete="off"
      autocorrect="off"
      @input="loginWords[i] = ($event.target as HTMLTextAreaElement).value.toLowerCase()"
    >
  </div>
</template>

<style scoped>
input, input:disabled{
  @apply bg-[#F2F2F4] border-0 outline-none py-1 px-2 text-center opacity-100 font-semibold placeholder:text-space-space-500/40;
}
</style>
