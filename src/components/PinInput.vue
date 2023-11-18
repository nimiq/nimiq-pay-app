<script setup lang="ts">
import { ref, watch } from 'vue'

const emit = defineEmits<{ (e: 'done', value: string): void }>()

const userInput = ref<string>()

watch(userInput, () => {
  if (userInput.value?.length === 4)
    emit('done', userInput.value)
})
</script>

<template>
  <input
    :value="userInput" type="password" inputmode="numeric" class="pin" pattern="[0-9]*" minlength="4"
    maxlength="4" size="4" placeholder="••••" autofocus="true" @input="userInput = ($event.target as HTMLInputElement).value"
  >
</template>
