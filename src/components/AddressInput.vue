<script setup lang="ts">
import { ValidationUtils } from '@nimiq/utils'
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  address: {
    type: String,
    required: false,
  },
})

const emit = defineEmits(['update:address'])

const inputAddress = ref<string[]>([])

watch(() => props.address, (address) => {
  if (address)
    inputAddress.value = address.replace(/\s/g, '').match(/.{1,4}/g) || []
})

watch(inputAddress, (input) => {
  const address = input.join('')
  if (ValidationUtils.isValidAddress(address)) {
    const { activeElement } = document
    if (activeElement instanceof HTMLInputElement)
      activeElement.blur()
    emit('update:address', Nimiq.Address.fromUserFriendlyAddress(address).toUserFriendlyAddress())
  }
  else {
    emit('update:address', '')
  }
}, { deep: true })

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = target.value
  const index = Number.parseInt(target.id)

  if (value.length > 4) {
    // Remove spaces and split every 4 characters
    const array = value.replace(/\s/g, '').match(/.{1,4}/g)
    if (!array)
      return
    if (index === 8) {
      target.value = array[0]
    }
    else {
      for (let i = 0; i < array.length; i++)
        inputAddress.value[index + i] = array[i]
    }
  }
  else {
    inputAddress.value[index] = value
  }

  // Focus on the next input
  if (index < 8 && value.length >= 4) {
    const nextInput = document.getElementById((index + 1).toString())
    if (nextInput)
      nextInput.focus()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    const target = event.target as HTMLInputElement
    const index = Number.parseInt(target.id)
    inputAddress.value[index] = inputAddress.value[index].slice(0, -1)
    if (inputAddress.value[index].length === 0 && index > 0) {
      const prevInput = document.getElementById((index - 1).toString())
      if (prevInput)
        nextTick(() => prevInput.focus())
    }
  }
  else if (event.key === 'Enter') {
    event.preventDefault()
    const target = event.target as HTMLInputElement
    const index = Number.parseInt(target.id)
    if (index < 8) {
      const nextInput = document.getElementById((index + 1).toString())
      if (nextInput)
        nextTick(() => nextInput.focus())
    }
    else {
      target.blur()
    }
  }
}
</script>

<template>
  <div class="grid grid-cols-3 gap-y-4">
    <div
      v-for="(_, i) in 9"
      :key="i"
      class="flex items-center"
      :class="{ 'justify-end': i % 3 === 0 }"
    >
      <!-- Only show horizontal lines in the middle element, that's the best way I found in my extend research (2 minutes) to prevent hacking too many things -->
      <div v-if="i % 3 === 1" class="xs:w-2 h-[1.5px] my-auto bg-space/20" />
      <input
        :id="i.toString()"
        :aria-label="`Address segment ${i}`"
        :value="inputAddress[i]"
        name="address"
        autocapitalize="characters"
        class="uppercase border-[1.5px] border-space-space-400 rounded py-1 px-2 min-w-[4.725rem] max-w-24 text-2xl text-center focus:outline-none focus:border-sky/40"
        @input="handleInput"
        @keydown="handleKeydown"
      >
      <div v-if="i % 3 === 1" class="xs:w-2 h-[1.5px] my-auto bg-space/20" />
    </div>
  </div>
</template>

<style scoped>
input {
  font-family: 'Fira Mono', monospace;
}
</style>
