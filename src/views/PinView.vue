<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { IonContent, IonGrid, IonHeader, IonPage, IonRow, IonToolbar } from '@ionic/vue'
import { useRouter } from 'vue-router'
import { Keyboard } from '@capacitor/keyboard'
import { storeToRefs } from 'pinia'
import { useConn } from '@/stores/conn'
import { useDecrypt } from '@/composables/useDecrypt'

const { dbExists } = storeToRefs(useConn())
const { decrypt, decrypted } = useDecrypt()
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

  await decrypt(pin.value)
  pinField.value?.blur()
  Keyboard.hide()
  router.replace('/app')
}

function shown() {
  setTimeout(() => {
    pinField.value?.focus()
  }, 200)
  Keyboard.show()
}

// Prevent the keyboard from hiding
// Keyboard.addListener('keyboardDidHide', () => {
//   pinField.value?.blur()
//   pinField.value?.focus()
// })

function handleBlur() {
  pinField.value?.focus()
}

onMounted(() => {
  if (!dbExists.value)
    router.replace('/setup')
  else if (decrypted.value)
    router.replace('/app')
  shown()
})

onUnmounted(() => {
  pinField.value?.blur()
  Keyboard.hide()
})
</script>

<template>
  <IonPage class="bg-[#F8F8F8]">
    <IonHeader class="ion-no-border">
      <IonToolbar />
    </IonHeader>
    <IonContent class="text-center ion-padding" style="--background: #F8F8F8">
      <IonGrid class="flex flex-col h-full">
        <IonRow class="ion-justify-content-center">
          <h1>Enter PIN</h1>
        </IonRow>
        <IonRow class="flex-1 ion-justify-content-center ion-align-items-center">
          <input
            ref="pinField" v-model="pin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4"
            maxlength="4" size="4" placeholder="••••" class="pin bg-[#F8F8F8]"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            autofocus="true"
            @blur="handleBlur"
          >
        </IonRow>
      </IonGrid>
    </IonContent>
  </IonPage>
</template>
