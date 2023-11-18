<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { markRaw, provide, ref } from 'vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import ShowWords from './ShowWords.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { NavKey } from '@/types/steps'

const nav = ref<Nav & HTMLElement>()
provide(NavKey, { navRef: nav })
</script>

<template>
  <ModalTemplate>
    <template #title>
      Hey, do a backup and secure your funds!
    </template>
    <p class="text-xl">
      If you don't do a backup, and you lose access to your phone, your money will be gone.
      <br>
      <br>
      Do a backup now to recover it in case you need to.
    </p>
    <!-- TODO: ask for pin before showing words -->
    <IonButton class="self-end w-full mb-2 font-bold" @click="nav!.push(markRaw(ShowWords))">
      Backup my account
    </IonButton>
  </ModalTemplate>
</template>
