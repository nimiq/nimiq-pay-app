<script setup lang="ts">
import { onMounted, ref } from 'vue'

const address = 'NQ02 YP68 BA76 0KR3 QY9C SF0K LP8Q THB6 LTKU'
const addressArray = ref('')

onMounted(() => {
  // Divide the address in parts of 4 chars each
  const array = address.split(' ').map(part => part.match(/.{1,4}/g))
  console.log('address', array)
})
</script>

<template>
  <div v-for="i in 3" :key="i" class="grid grid-cols-[repeat(5,minmax(0,auto))] my-2">
    <template v-for="j in 3" :key="i.toString() + j.toString()">
      <div class="border-[1.5px] border-space-space-400 rounded p-2 min-w-[5rem] text-xl text-center">
        {{ `NQ${i}${j}` }}
      </div>
      <div v-if="j !== 3" class="w-2 h-[1.5px] my-auto bg-space/20" />
    </template>
  </div>
</template>
