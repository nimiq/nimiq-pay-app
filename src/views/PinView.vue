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

async function handleSubmit() {
  if (pin.value.length < 4)
    return false
  await storageManager.unlock(pin.value)
  continueToApp()
  return false
}

function shown() {
  setTimeout(() => {
    pinField.value?.focus()
    Keyboard.show()
  }, 200)
}

async function continueToApp() {
  await storageManager.awaitUnlocked()
  pinField.value?.blur()
  Keyboard.hide()
  router.replace('/app')
}

// Prevent the keyboard from hiding
// Keyboard.addListener('keyboardDidHide', () => {
//   pinField.value?.blur()
//   pinField.value?.focus()
// })

function handleBlur() {
  pinField.value?.focus()
}

onMounted(async () => {
  if (!(await storageManager.exists()) || !(await storageManager.isSetupDone())) {
    await router.replace('/setup')
    return
  }

  shown()
})
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
              autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
              autofocus="true"
              @blur="handleBlur"
            >
          </form>
        </IonRow>
      </IonGrid>
    </IonContent>
  </IonPage>
</template>
