<script setup lang="ts">
import { Keyboard } from '@capacitor/keyboard'
import { InAppBrowser } from '@capgo/inappbrowser'
import { IonContent, IonGrid, IonHeader, IonPage, IonToolbar } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PinInput from '@/components/PinInput.vue'
import { useDecrypt } from '@/composables/useDecrypt'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { useConn } from '@/stores/conn'

const logger = useLogger('PinView')
const { dbExists } = storeToRefs(useConn())
const { decrypt, decrypted } = useDecrypt()
const router = useRouter()
const errorMsg = ref('')

async function handleSubmit(pin: string) {
  if (pin.length < 4)
    return false

  const error = await decrypt(pin)
  if (error) {
    errorMsg.value = error
    window.setTimeout(() => {
      errorMsg.value = ''
    }, 2000)
    return
  }
  await router.replace('/app')
}

function shown() {
  const input = document.querySelector('input')
  window.setTimeout(() => {
    input?.focus()
    try {
      if (useDevice().isAndroid)
        Keyboard.show()
    }
    catch (error) {
      logger.error('Failed to show keyboard', error)
    }
  }, 200)
}

onMounted(() => {
  if (!dbExists.value)
    router.replace('/setup')
  else if (decrypted.value)
    router.replace('/app')
  shown()

  // As a fallback if for whatever reason any webview is still showing
  try {
    InAppBrowser.close()
  }
  catch {}
})
</script>

<template>
  <IonPage class="bg-[#F8F8F8]">
    <IonHeader class="ion-no-border">
      <IonToolbar />
    </IonHeader>
    <IonContent class="ion-padding text-center" style="--background: #F8F8F8">
      <IonGrid class="h-full flex flex-col">
        <h1 class="font-bold">
          {{ $t('Enter PIN') }}
        </h1>
        <PinInput :input-length="4" :error-msg="errorMsg" :can-use-biometric="true" @done="handleSubmit" />
      </IonGrid>
    </IonContent>
  </IonPage>
</template>
