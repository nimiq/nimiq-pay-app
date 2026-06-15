<script setup lang="ts">
import { IonButton, IonContent, IonHeader, IonPage, IonToolbar } from '@ionic/vue'
import { onLongPress } from '@vueuse/core'
import { ref } from 'vue'
import NimiqPayLogo from '@/components/icons/nimiq-pay-logo.vue'
import { useLogger } from '@/composables/useLogger'
import { trackWalletEntrySelected } from '@/lib/analytics'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'

const logger = useLogger('SetupView')

// Escape hatch to export logs if setup fails here (Settings is unreachable). Long-press the logo for 3s.
const logoRef = ref<HTMLElement | null>(null)
onLongPress(logoRef, () => logger.sendReport(), { modifiers: { prevent: true }, delay: 3 * 1e3 })

function startSetupFlow(entryMethod: 'create' | 'create_with_promo_code' | 'import') {
  trackWalletEntrySelected(entryMethod)
  if (entryMethod === 'create')
    return initializeFlow(FlowName.Setup)
  if (entryMethod === 'create_with_promo_code')
    return initializeFlow(FlowName.SetupWithPromoCode)
  return initializeFlow(FlowName.Login)
}
</script>

<template>
  <IonPage>
    <IonHeader class="ion-no-border">
      <IonToolbar />
    </IonHeader>
    <IonContent :fullscreen="true">
      <div class="flex flex-col items-center justify-center h-full text-center">
        <div ref="logoRef" class="mt-auto">
          <NimiqPayLogo class="w-[169px]" />
        </div>
        <div class="w-10/12 mx-auto mt-auto">
          <IonButton class="w-full text-base" expand="block" @click="startSetupFlow('create')">
            {{ $t('Get Started') }}
          </IonButton>
          <div class="grid grid-cols-[repeat(2,auto)]">
            <IonButton class="text-base tracking-normal normal-case" fill="clear" @click="startSetupFlow('create_with_promo_code')">
              {{ $t('I have a promo code') }}
            </IonButton>
            <IonButton class="text-base tracking-normal normal-case" fill="clear" @click="startSetupFlow('import')">
              {{ $t('Login') }}
            </IonButton>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
ion-toolbar {
    --background: none;
}

ion-icon.icon-extra-large {
    font-size: 96px;
    padding: 32px;
}
</style>
