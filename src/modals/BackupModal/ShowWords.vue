<script setup lang="ts">
import { IonBackButton, IonButton, IonButtons } from '@ionic/vue'
import { inject, markRaw } from 'vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { asyncComputed } from '@vueuse/core'
import ValidateWords from './ValidateWords.vue'
import { NimiqWallet } from '@/lib/nimiq-wallet'
import ModalTemplate from '@/components/ModalTemplate.vue'
import MnemonicInput from '@/components/MnemonicInput.vue'

const nav = (document.querySelector('[data-backup-nav]')) as Nav & HTMLElement
const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet

const words = asyncComputed(async () => {
  return await nimiqWallet.getWords()
}, ['Loading...'])
</script>

<template>
  <ModalTemplate>
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="nav.pop()" />
      </IonButtons>
    </template>
    <template #title>
      Write these 12 Words on Paper
    </template>
    <template #subtitle>
      Anyone with these words can access your account! Keep them safe.
    </template>
    <MnemonicInput :recovery-words="words" />
    <IonButton class="self-end w-full mb-2 text-lg font-bold" @click="nav.push(markRaw(ValidateWords))">
      Next
    </IonButton>
  </ModalTemplate>
</template>
