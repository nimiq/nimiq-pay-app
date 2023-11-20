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
      Copy the words
    </template>
    <template #subtitle>
      Write the words below on a piece of paper in the right order. 
      <br>
      Keep it safe and never share it!
    </template>
    <MnemonicInput :recovery-words="words" />
    <IonButton class="self-end w-full text-base" @click="nav.push(markRaw(ValidateWords))">
      Continue
    </IonButton>
  </ModalTemplate>
</template>
