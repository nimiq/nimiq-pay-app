<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { type Ref, ref } from 'vue'
import { computed } from 'vue'
import MnemonicInput from '@/components/MnemonicInput.vue'
import { stepEmits } from '@/lib/flows/steps.types'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

defineProps({ errorMsg: { type: String } })
defineEmits(stepEmits)

const isDev = import.meta.env.DEV

const loginWords: Ref<string[]> = ref([])
const isDevImport = ref(false)
const isValidMnemonic = computed(() => loginWords.value.length === 12 && loginWords.value.every(word => Nimiq.MnemonicUtils.DEFAULT_WORDLIST.includes(word)))

const devWallet = ['tube', 'siege', 'funny', 'crouch', 'notable', 'setup', 'adult', 'cost', 'country', 'mask', 'night', 'giraffe']
</script>

<template>
  <div class="flex flex-col justify-center mt-auto">
    <MnemonicInput :recovery-words="isDevImport ? loginWords : undefined" @login-words="(v) => loginWords = v" />
    <button v-if="isDev" class="mt-8 text-sm italic text-blue-300" @click="() => { loginWords = devWallet; isDevImport = true }">
      Import dev wallet
    </button>
    <p v-if="errorMsg" class="text-center text-pumpkin">
      {{ errorMsg }}
    </p>
  </div>
  <IonButton expand="block" class="w-full mt-auto mb-4 font-bold" :disabled="!isValidMnemonic" @click="$emit('done', loginWords)">
    {{ $t('Confirm') }}
  </IonButton>
</template>
