<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { inject, ref, unref } from 'vue'
import type { Ref } from 'vue'
import { NimiqWallet } from '@/lib/nimiq-wallet'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { ModalType, useModal } from '@/composables/useModal'
import MnemonicInput from '@/components/MnemonicInput.vue'

const isDev = import.meta.env.DEV

const { showModal } = useModal()
const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet
const loginWords: Ref<string[]> = ref([])
const isDevImport = ref(false)

function handleLogin() {
  nimiqWallet.importBackup(loginWords.value)
  showModal(ModalType.NewPin)
}

const devWallet = ['tube', 'siege', 'funny', 'crouch', 'notable', 'setup', 'adult', 'cost', 'country', 'mask', 'night', 'giraffe']
</script>

<template>
  <ModalTemplate>
    <template #title>
      Enter recovery words
    </template>
    <div>
      <MnemonicInput :recovery-words="isDevImport ? loginWords : undefined" @login-words="(v) => loginWords = v" />
      <button v-if="isDev" class="mt-8 text-sm italic text-blue-300" @click="() => { loginWords = devWallet; isDevImport = true }">
        Import dev wallet
      </button>
    </div>
    <IonButton expand="block" class="self-end w-full mb-4 font-bold" @click="handleLogin">
      Confirm
    </IonButton>
  </ModalTemplate>
</template>
