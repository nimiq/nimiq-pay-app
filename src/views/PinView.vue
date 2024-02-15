<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { IonContent, IonGrid, IonHeader, IonPage, IonRow, IonToolbar } from '@ionic/vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Keyboard } from '@capacitor/keyboard'
import { useConn } from '@/stores/conn'
import { useDecrypt } from '@/composables/useDecrypt'
import PinInput from '@/components/PinInput.vue'

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
    setTimeout(() => {
      errorMsg.value = ''
    }, 2000)
    return
  }
  await router.replace('/app')
}

function shown() {
  const input = document.querySelector('input')
  setTimeout(() => {
    // TODO: this is not working, idk why
    input?.focus()
    Keyboard.show()
  }, 200)
}

onMounted(() => {
  if (!dbExists.value)
    router.replace('/setup')
  else if (decrypted.value)
    router.replace('/app')
  shown()
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
          <h1 class="font-bold">
            {{ $t('Enter PIN') }}
          </h1>
        </IonRow>
        <IonRow class="flex-1 ion-justify-content-center ion-align-items-center">
          <PinInput :input-length="4" :error-msg="errorMsg" @done="handleSubmit" />
        </IonRow>
      </IonGrid>
    </IonContent>
  </IonPage>
</template>
