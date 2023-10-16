<script setup lang="ts">
import { IonGrid, IonModal, IonRow } from '@ionic/vue'
import CheckIcon from '@/components/icons/check.vue'

async function canDismiss(data?: any, role?: string){
  return role !== 'backdrop'
}
</script>

<template>
  <IonModal :can-dismiss="canDismiss">
    <IonGrid class="px-10 py-8 min-h-[18rem] text-center flex flex-col">
      <IonRow class="ion-justify-content-center">
        <CheckIcon class="w-16" />
      </IonRow>
      <IonRow class="my-auto ion-justify-content-center">
        <h2 class="text-3xl font-semibold">
          <slot name="title" />
        </h2>
      </IonRow>
      <IonRow class="ion-justify-content-center">
        <p class="text-5xl">
          <slot name="body" />
        </p>
      </IonRow>
      <IonRow class="ion-justify-content-center">
        <p class="text-lg">
          <slot name="extra" />
        </p>
      </IonRow>
    </IonGrid>
  </IonModal>
</template>

<style scoped>
ion-modal {
    --width: fit-content;
    --min-width: 250px;
    --max-width: 80vw;
    --height: fit-content;
    --border-radius: 18px;
    --border-color: rgb(59 130 246);
    --border-width: 1.5px;
    --border-style: solid;
}
</style>
