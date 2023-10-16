<script setup lang="ts">
import { inject, onMounted, ref, watch } from 'vue'
import { IonContent, IonGrid, IonHeader, IonPage, IonRow, IonToolbar } from '@ionic/vue'
import { useRouter } from 'vue-router'
import { Keyboard } from '@capacitor/keyboard'
import { StorageManager } from '@/lib/storage-manager'

const storageManager = inject(StorageManager.KEY) as StorageManager
const router = useRouter()
const pinField = ref()
const pin = ref('')

watch(pin, (newValue) => {
  if (newValue.length === 4)
    handleSubmit()
})

function handleSubmit() {
  if (pin.value.length < 4)
    return false
  storageManager.unlock(pin.value)
  return false
}

function shown() {
  setTimeout(() => {
    pinField.value?.focus()
  }, 200)
  Keyboard.show()
  continueToApp()
}

async function continueToApp() {
  await storageManager.awaitUnlocked()
  router.replace('/app')
}

// Prevent the keyboard from hiding
Keyboard.addListener('keyboardDidHide', () => {
  pinField.value?.blur()
  pinField.value?.focus()
})

function handleBlur() {
  pinField.value?.focus()
}

onMounted(shown)
</script>

<template>
  <IonPage>
    <IonHeader class="ion-no-border">
      <IonToolbar />
    </IonHeader>
    <IonContent class="text-center ion-padding">
      <IonGrid class="flex flex-col h-full">
        <IonRow class="ion-justify-content-center">
          <h1>Enter PIN</h1>
        </IonRow>
        <IonRow class="flex-1 ion-justify-content-center ion-align-items-center">
          <form @submit.prevent="handleSubmit">
            <input
              ref="pinField" v-model="pin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4"
              maxlength="4" size="4" placeholder="••••" class="pin"
              autofocus="true"
              @blur="handleBlur"
            >
          </form>
        </IonRow>
      </IonGrid>
    </IonContent>
  </IonPage>
</template>
