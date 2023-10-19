<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { ref, watch, watchEffect } from 'vue'
import type { Ref } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { ModalType, useModal } from '@/composables/useModal'
import MnemonicInput from '@/components/MnemonicInput.vue'

const { showModal } = useModal()
const loginWords: Ref<string[]> = ref([])

watchEffect(() => {
  const iterator = loginWords.value.values()
  for (let i = 0; i < 12; i++) {
    const word = iterator.next().value
    if (word)
      console.log(i, word)
  }
})

function handleLogin() {
  // TODO: if login, don't show backup notification
  console.log('loginWords', loginWords.value)
  // showModal(ModalType.NewPin)
}
</script>

<template>
  <ModalTemplate>
    <template #title>
      Enter recovery words
    </template>
    <MnemonicInput @login-words="(v) => loginWords = v" />
    <IonButton expand="block" class="self-end w-full mb-4 font-bold" @click="handleLogin">
      Confirm
    </IonButton>
  </ModalTemplate>
</template>
