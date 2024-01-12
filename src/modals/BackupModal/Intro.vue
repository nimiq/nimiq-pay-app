<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { markRaw } from 'vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import ShowWords from './ShowWords.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import InfoIcon from '@/components/icons/info.vue'

const nav = (document.querySelector('[data-backup-nav]')) as Nav & HTMLElement
</script>

<template>
  <ModalTemplate>
    <template #title>
      {{ $t('There is no "Forgot Password"') }}
    </template>
    <template #subtitle>
      {{ $t('Create a backup. It\'s the only way to recover your account.') }}
    </template>
    <div class="self-end">
      <div class="flex items-start justify-center font-semibold gap-x-2 text-space/60">
        <InfoIcon class="h-6 w-6 stroke-[1.5] text-space/60" />
        <span>
          {{ $t('The backup is a list of 12 words. Please make sure no one can see your screen before continuing.') }}
        </span>
      </div>
      <!-- TODO: ask for pin before showing words -->
      <IonButton class="w-full mt-6 text-base" @click="nav.push(markRaw(ShowWords))">
        {{ $t('No One can See me') }}
      </IonButton>
    </div>
  </ModalTemplate>
</template>
