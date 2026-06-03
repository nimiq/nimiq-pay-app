<script setup lang="ts">
import { IonApp, IonButton, IonContent, IonHeader, IonPage, IonToolbar } from '@ionic/vue'
import NimiqPayLogo from '@/components/icons/nimiq-pay-logo.vue'

function reload() {
  window.location.reload()
}
</script>

<template>
  <IonApp>
    <IonPage>
      <IonHeader class="ion-no-border">
        <IonToolbar />
      </IonHeader>
      <IonContent :fullscreen="true">
        <div class="flex flex-col items-center justify-center h-full text-center px-8">
          <div class="mt-auto">
            <NimiqPayLogo class="w-[135px]" />
          </div>
          <div class="flex flex-col items-center mt-auto max-w-md mx-auto">
            <h1 class="text-4xl font-bold tracking-tight text-space text-balance">
              {{ $t('Lockdown Mode is on') }}
            </h1>
            <p class="mt-5 text-base font-medium leading-relaxed text-space/70 text-pretty">
              {{ $t('Nimiq Pay relies on WebAssembly, which iOS Lockdown Mode blocks. The app cannot run until Lockdown Mode is turned off.') }}
            </p>
            <p class="mt-3 text-sm font-medium leading-relaxed text-space/60">
              {{ $t('Go to Settings → Privacy & Security → Lockdown Mode') }}
            </p>
            <p class="mt-1 text-sm font-medium leading-relaxed text-space/60">
              {{ $t('Turn it off, then reopen Nimiq Pay.') }}
            </p>
          </div>
          <div class="w-10/12 mx-auto mt-auto mb-4">
            <IonButton class="w-full text-base" expand="block" @click="reload">
              {{ $t('I have turned it off') }}
            </IonButton>
          </div>
        </div>
      </IonContent>
    </IonPage>
  </IonApp>
</template>

<style scoped>
ion-toolbar {
    --background: none;
}
</style>
