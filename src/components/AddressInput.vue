<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

  const array = addressStringToArray(address)
  return array as string[]
})

watch(inputAddress, (address) => {
  if (!ValidationUtils.isValidAddress(address)) {
    // TODO: Show error
    console.error('Invalid address')
    return
  }
  emit('update:address', address)
})

// TODO: refactor all this ugly code
function handleInput() {
  // TODO: Replace special letters
  // https://github.com/nimiq/vue-components/blob/5748e875e0e128441cc905b21684293d229da7dc/src/components/AddressInput.vue#L64
  for (let i = 1; i <= 3; i++) {
    for (let j = 1; j <= 3; j++) {
      const input = document.getElementsByName(`block-${i}${j}`)[0] as HTMLInputElement
      if (input.value.length === 4) {
        if (i === 3 && j === 3) {
          // Only blur if writing in the last input
          const row = Number.parseInt(input.name.split('-')[1][0])
          const column = Number.parseInt(input.name.split('-')[1][1])
          if (row === 3 && column === 3) {
            input.blur()
            getAddressFromInputs()
            return
          }
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
    if (row === 1 && column === 1)
      return

    const previousInput = document.getElementsByName(`block-${column === 1 ? row - 1 : row}${column === 1 ? 3 : column - 1}`)[0] as HTMLInputElement
    previousInput.focus()
  }
}

function handlePaste(event: ClipboardEvent) {
  const { clipboardData } = event || window
  if (!clipboardData)
    return
  const clipboardText = clipboardData.getData('text').replace(/ /g, '')
  if (!clipboardText)
    return

  // An address without spaces is 36 characters long
  // If we have a full address, fill from the beginning
  if (clipboardText.length === 36) {
    const array = addressStringToArray(clipboardText)
    const iterator = array.values()
    for (let i = 1; i <= 3; i++) {
      for (let j = 1; j <= 3; j++) {
        const input = document.getElementsByName(`block-${i}${j}`)[0] as HTMLInputElement
        input.value = iterator.next().value
      }
    }
    inputAddress.value = clipboardText
  }
  else if (clipboardText.length < 36) {
    // If we have a partial address, fill from the current input
    const array = addressStringToArray(clipboardText)
    const focusedInput = document.activeElement as HTMLInputElement
    if (!focusedInput)
      return
    const focusedInputName = focusedInput.name
    const focusedInputNameArray = focusedInputName.split('-')
    const row = Number.parseInt(focusedInputNameArray[1][0])
    let column = Number.parseInt(focusedInputNameArray[1][1])

    const iterator = array.values()
    for (let i = row; i <= 3; i++) {
      for (let j = column; j <= 3; j++) {
        const input = document.getElementsByName(`block-${i}${j}`)[0] as HTMLInputElement
        input.value = iterator.next().value || ''
        if (i === 3 && j === 3)
          input.blur()
        if (!input.value)
          break
      }
      column = 1
    }
    getAddressFromInputs()
  }
  else {
    // eslint-disable-next-line no-console
    console.log('Clipboard text is too long to be an address, filling only first input')
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
}

function addressStringToArray(address: string) {
  const array = address.replace(/ /g, '').match(/.{1,4}/g)
  if (!array) {
    console.error('Invalid address')
    return []
  }
  return array
}
</script>

<template>
  <div v-for="i in 3" :key="i" class="grid grid-cols-[repeat(5,minmax(0,auto))] my-2 justify-center">
    <template v-for="j in 3" :key="i.toString() + j.toString()">
      <input
        :name="`block-${i}${j}`" :value="address[i - 1 + j - 1]"
        maxlength="4" minlength="4" autocapitalize="characters"
        class="uppercase border-[1.5px] border-space-space-400 rounded py-1 px-2 min-w-[4.725rem] max-w-24 text-2xl text-center focus:outline-none focus:border-sky/40"
        @input="handleInput" @keydown="handleDelete" @paste="handlePaste"
      >
      <div v-if="j !== 3" class="xs:w-2 h-[1.5px] my-auto bg-space/20" />
    </template>
  </div>
</template>

<style scoped>
input {
  font-family: 'Fira Mono', monospace;
}
</style>
