<script setup lang="ts">
import { IonBackButton, IonButton, IonButtons } from '@ionic/vue'
import { markRaw } from 'vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { asyncComputed } from '@vueuse/core'
import ValidateWords from './ValidateWords.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import MnemonicInput from '@/components/MnemonicInput.vue'
import { useLocalWallet } from '@/stores/local-wallet'
import { i18n } from '@/i18n/i18n-setup'

const nav = (document.querySelector('[data-backup-nav]')) as Nav & HTMLElement
const { getWords } = useLocalWallet()

const words = asyncComputed(async () => {
  const { data, error } = await getWords()
  if (error) {
    console.error(error)
    return []
  }
  if (data)
    return data
}, [i18n.t('Loading…')])
</script>

<template>
  <ModalTemplate>
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="nav.pop()" />
      </IonButtons>
    </template>
    <template #title>
      {{ $t('Write down these words') }}
    </template>
    <template #subtitle>
      <span class="whitespace-pre-line">
        {{ $t('Write the words below on a piece of paper in the exact order.\nKeep your recovery words safe and never share them with anyone!') }}
      </span>
    </template>
    <MnemonicInput :recovery-words="words" />
    <IonButton class="self-end w-full text-base" @click="nav.push(markRaw(ValidateWords))">
      {{ $t('Continue') }}
    </IonButton>
  </ModalTemplate>
</template>
