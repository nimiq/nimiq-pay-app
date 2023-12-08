<script setup lang="ts">
import { computed, ref } from 'vue'
import { ValidationUtils } from '@nimiq/utils'

const props = defineProps({
  address: {
    type: String,
    required: false,
  },
})

const emit = defineEmits(['update:address'])

const inputAddress = ref('')

const address = computed(() => {
  const { address } = props
  if (!address)
    return []

  const array = address.replace(/ /g, '').match(/.{1,4}/g)
  if (!array) {
    console.error('Invalid address')
    return []
  }
  return array as string[]
})

function handleInput() {
  // TODO: Replace special letters
  // https://github.com/nimiq/vue-components/blob/5748e875e0e128441cc905b21684293d229da7dc/src/components/AddressInput.vue#L64
  for (let i = 1; i <= 3; i++) {
    for (let j = 1; j <= 3; j++) {
      const input = document.getElementsByName(`block-${i}${j}`)[0] as HTMLInputElement
      if (input.value.length === 4) {
        if (i === 3 && j === 3) {
          input.blur()
          getAddressFromInputs()
          return
        }
        const nextInput = document.getElementsByName(`block-${j === 3 ? i + 1 : i}${j === 3 ? 1 : j + 1}`)[0] as HTMLInputElement
        nextInput.focus()
      }
    }
  }
}

function handleDelete(event: KeyboardEvent) {
  const { key } = event
  if (key === 'Backspace') {
    // Get which input is the focused one
    const focusedInput = document.activeElement as HTMLInputElement
    if (!focusedInput)
      return
    if (focusedInput.value.length > 0)
      return
    const focusedInputName = focusedInput.name
    const focusedInputNameArray = focusedInputName.split('-')
    const row = Number.parseInt(focusedInputNameArray[1][0])
    const column = Number.parseInt(focusedInputNameArray[1][1])

    const previousInput = document.getElementsByName(`block-${column === 1 ? row - 1 : row}${column === 1 ? 3 : column - 1}`)[0] as HTMLInputElement
    previousInput.focus()
  }
}

function getAddressFromInputs() {
  inputAddress.value = ''
  for (let i = 1; i <= 3; i++) {
    for (let j = 1; j <= 3; j++) {
      const input = document.getElementsByName(`block-${i}${j}`)[0] as HTMLInputElement
      inputAddress.value += input.value.toUpperCase()
    }
  }
  if (!ValidationUtils.isValidAddress(inputAddress.value)) {
    // TODO: Show error
    console.error('Invalid address')
    return
  }
  emit('update:address', inputAddress.value)
}
</script>

<template>
  <div v-for="i in 3" :key="i" class="grid grid-cols-[repeat(5,minmax(0,auto))] my-2">
    <template v-for="j in 3" :key="i.toString() + j.toString()">
      <input :name="`block-${i}${j}`" :value="address[i - 1 + j - 1]" maxlength="4" minlength="4" autocapitalize="characters" class="uppercase border-[1.5px] border-space-space-400 rounded p-2 min-w-[5rem] text-xl text-center" @input="handleInput" @keydown="handleDelete">
      <div v-if="j !== 3" class="w-2 h-[1.5px] my-auto bg-space/20" />
    </template>
  </div>
</template>

<style scoped>
input {
  font-family: 'Fira Mono', monospace;
}
</style>
