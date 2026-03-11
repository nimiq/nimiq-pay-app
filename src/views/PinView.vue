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
import { clearSession, hasPendingSession, reconnectAndShow } from '@/composables/useMiniAppSession'
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

  // If a mini-app webview was hidden before the reload, reconnect and show it
  if (hasPendingSession()) {
    try {
      await reconnectAndShow()
    }
    catch (err) {
      logger.error('Failed to reconnect mini-app session:', err)
      await clearSession()
      try {
        await InAppBrowser.close()
      }
      catch {}
    }
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

onMounted(async () => {
  if (!dbExists.value) {
    // No wallet — clear any stale session and close orphaned webview
    await clearSession()
    try {
      InAppBrowser.close()
    }
    catch {}
    router.replace('/setup')
  }
  else if (decrypted.value) {
    router.replace('/app')
  }
  else {
    // PIN screen shown — only close webview if there's no pending session to preserve
    if (!hasPendingSession()) {
      try {
        InAppBrowser.close()
      }
      catch {}
    }
  }
  shown()
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
