<script setup lang="ts">
import WithdrawalAddressList from '@/components/WithdrawalAddressList.vue'
import { stepEmits } from '@/lib/flows/steps.types'

// Declared so Flow's step listeners (e.g. `select`) don't fall through as native DOM listeners on the root.
defineEmits(stepEmits)
</script>

<template>
  <div class="w-full flex flex-col pt-4">
    <WithdrawalAddressList manage />
  </div>
</template>
