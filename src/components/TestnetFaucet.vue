<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { tapFaucet } from '@/lib/faucet'

const props = defineProps<{ address: string }>()

const loading = ref(false)
const { setToast } = useToast()

async function tap() {
  if (loading.value)
    return
  loading.value = true
  const { error } = await tapFaucet(props.address)
  loading.value = false
  await setToast(error ? { message: error, type: 'error' } : { message: i18n.t('Free NIM is on its way') })
}
</script>

<template>
  <button
    aria-label="Get free NIM"
    class="px-6 py-2 text-base font-bold rounded-full text-white disabled:opacity-50"
    style="background: var(--radial-gradient-green);"
    :disabled="loading"
    @click="tap"
  >
    {{ loading ? $t('Requesting…') : $t('Get free NIM') }}
  </button>
</template>
