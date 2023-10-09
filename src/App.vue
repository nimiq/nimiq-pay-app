<script setup lang="ts">
import { IonApp, IonFab, IonFabButton, IonIcon } from '@ionic/vue'
import { bugOutline } from 'ionicons/icons'
import { RouterView, useRouter } from 'vue-router'
import { StatusBar } from '@capacitor/status-bar'
import { ModalType, useModal } from '@/composables/useModal'

const isDev = import.meta.env.DEV

StatusBar.setBackgroundColor({ color: '#ffffff' })
StatusBar.setOverlaysWebView({ overlay: false })

useRouter().afterEach(() => {
  useModal().closeModal()
})
</script>

<template>
  <IonApp>
    <RouterView />
    <!-- DEV -->
    <IonFab v-if="isDev" slot="fixed" horizontal="end" vertical="bottom" style="z-index: 999999;">
      <IonFabButton @click="() => useModal().showModal(ModalType.Dev)">
        <IonIcon :icon="bugOutline" />
      </IonFabButton>
    </IonFab>
    <!-- !DEV -->
  </IonApp>
</template>

<style>
ion-toolbar {
  --background: transparent;
}

input.pin {
  text-align: center;
  font-size: 40px;
  font-family: monospace;
}

input.phone {
  font-size: 20px;
  font-family: monospace;
}

ion-modal ion-toolbar {
    --border-color: transparent;
    --background: var(--ion-background-color, #fff);
}

body.scanner-active ion-app>:not(ion-modal) {
    display: none;
}

body.scanner-active ion-content, body.scanner-active .ion-page, body.scanner-active ion-modal {
    --background: none;
}

/* TODO: Remove this */
p, a, h1, h2, h3, h4, h5, h6, svg {
  color: rgb(59 130 246);
}
</style>
