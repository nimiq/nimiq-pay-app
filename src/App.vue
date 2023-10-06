<script setup lang="ts">
import { IonApp } from '@ionic/vue'
import { RouterView, useRouter } from 'vue-router'
import { StatusBar } from '@capacitor/status-bar'
import { useModal } from '@/composables/useModal'

StatusBar.setBackgroundColor({ color: '#ffffff' })
StatusBar.setOverlaysWebView({ overlay: false })

useRouter().afterEach(() => {
  useModal().closeModal()
})
</script>

<template>
  <IonApp>
    <RouterView />
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

/* TODO: Remove this */
p, a, h1, h2, h3, h4, h5, h6, svg {
  color: rgb(59 130 246);
}
</style>
