<script setup lang="ts">
import InfoIcon from '@/components/icons/info.vue'
import MnemonicInput from '@/components/MnemonicInput.vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { isDev } from '@/lib/index'
import { IonButton } from '@ionic/vue'
import { type Ref, ref } from 'vue'
import { computed } from 'vue'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

defineProps({ errorMsg: { type: String } })
defineEmits(stepEmits)

const loginWords: Ref<string[]> = ref([])
const isDevImport = ref(false)
const isValidMnemonic = computed(() => loginWords.value.length === 12 && loginWords.value.every(word => Nimiq.MnemonicUtils.DEFAULT_WORDLIST.includes(word)))

const devWallet = ['tube', 'siege', 'funny', 'crouch', 'notable', 'setup', 'adult', 'cost', 'country', 'mask', 'night', 'giraffe']
</script>

<template>
  <div class="flex flex-col h-max pt-4 my-auto justify-center">
    <MnemonicInput :recovery-words="isDevImport ? loginWords : undefined" @login-words="(v) => loginWords = v" />
    <button v-if="isDev" class="mt-8 text-sm italic text-blue-300" @click="() => { loginWords = devWallet; isDevImport = true }">
      Import dev wallet
    </button>
    <div class="flex justify-center items-baseline gap-2 mt-12 w-[max(80%,14rem)] mx-auto">
      <InfoIcon class="size-3 stroke-[1.5] text-space/60 shrink-0" />
      <p class="font-semibold text-space/60">
        {{ $t('Nimiq Pay and Nimiq Wallet use different recovery words.') }}
      </p>
    </div>
    <p v-if="errorMsg" class="mt-auto mb-4 text-center text-pumpkin">
      {{ errorMsg }}
    </p>
  </div>
  <IonButton expand="block" class="w-full font-bold mb-[max(env(safe-area-inset-bottom),1rem)] min-h-14" :disabled="!isValidMnemonic" @click="$emit('done', loginWords)">
    {{ $t('Confirm') }}
  </IonButton>
</template>
