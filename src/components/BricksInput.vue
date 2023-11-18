<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps({
  length: {
    type: Number,
    default: 6,
  },
})

const emit = defineEmits<{ (e: 'done', value: string): void }>()

const value = defineModel<string>()

const len = ref(props.length)

const inputs$ = ref<HTMLInputElement[]>([])

const validKey = /^[a-zA-Z0-9]$|^Backspace$/

function setAndGo(event: KeyboardEvent, i: number) {
  const key = event.key
  if (!validKey.test(key))
    return
  event.preventDefault()

  if (key === 'Backspace') {
    inputs$.value[i]!.value = ''
    if (i > 0)
      inputs$.value[i - 1]?.focus()
  }
  else {
    inputs$.value[i]!.value = key
    if (i < len.value - 1) { inputs$.value[i + 1]?.focus() }
    else {
      inputs$.value[i]!.blur()
      value.value = inputs$.value.map(input => input.value).join('')
      emit('done', value.value)
    }
  }
}

function pasteHandler(event: ClipboardEvent, i: number) {
  const pastedValue = event.clipboardData?.getData('text')
  if (!pastedValue)
    return

  let j = i
  for (const char of pastedValue) {
    if (j >= len.value || !validKey.test(char))
      break
    inputs$.value[j]!.value = char
    j++
  }

  if (j >= len.value) {
    value.value = inputs$.value.map(input => input.value).join('')
    emit('done', value.value)
  }
  else { inputs$.value[j]?.focus() }
}
</script>

<template>
  <form class="flex max-w-md group gap-x-2">
    <input
      v-for="i in len"
      ref="inputs$" :key="i"
      :autofocus="i === 0" class="flex text-2xl text-center border-2 max-w-[4ch] py-3 rounded-md outline-none border-sky/50 group-focus-within:border-sky focus:border-sky text-sky h-max"
      maxlength="1" @keydown="setAndGo($event, i - 1)" @paste="pasteHandler($event, i - 1)"
    >
  </form>
</template>
