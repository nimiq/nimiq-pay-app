<script setup lang="ts">
import { IonButton, IonContent, IonGrid, IonHeader, IonPage, IonRow, IonToolbar } from '@ionic/vue'
import { useRouter } from 'vue-router'
import type { Ref } from 'vue'
import { markRaw, ref, watch } from 'vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { useSwipe } from '@vueuse/core'
import Tab1 from './Tab1.vue'
import Tab2 from './Tab2.vue'
import Tab3 from './Tab3.vue'
import { ModalType, useModal } from '@/composables/useModal'

const tabList = [
  markRaw(Tab1),
  markRaw(Tab2),
  markRaw(Tab3),
]

const { showModal } = useModal()
const nav = (document.querySelector('[data-reward-info-nav]')) as Nav & HTMLElement
const swipeable = ref(null)
const smoothSpring: Ref<number | null> = ref(0)
const { isSwiping, direction, lengthX } = useSwipe(swipeable, { threshold: 1 })
const maxSwipe = 40

async function handleGoTo() {
  await showModal(ModalType.Rewards)
}

async function getActiveTab() {
  const active = await nav.getActive()
  if (!active) {
    return 0
  }
  else {
    const index = tabList.findIndex(tab => tab.__name === active.component.__name)
    return index === -1 ? 0 : index
  }
}

watch(isSwiping, async () => {
  if (!isSwiping.value) {
    smoothSpring.value = 0

    if (Math.abs(lengthX.value) > maxSwipe) {
      const activeTab = await getActiveTab()
      const isForward = direction.value === 'right' ? -1 : 1
      if (tabList[activeTab + isForward])
        nav.push(tabList[activeTab + isForward], undefined, { direction: isForward === 1 ? 'forward' : 'back', mode: 'ios' })
      else if (isForward === 1)
        handleGoTo()
    }
  }
  else {
    smoothSpring.value = null
  }
})
</script>

<template>
  <IonPage>
    <IonHeader class="ion-no-border">
      <IonToolbar />
    </IonHeader>
    <IonContent ref="swipeable" class="text-center ion-padding" :style="{ right: `${smoothSpring !== null ? smoothSpring : Math.sign(lengthX) * Math.min(Math.abs(lengthX), maxSwipe)}px` }">
      <IonGrid class="flex flex-col h-full gap-4 px-4 pb-4">
        <IonRow class="ion-justify-content-center">
          <h1 class="mb-2">
            <slot name="title" />
          </h1>
          <p class="px-8 text-lg font-semibold">
            <slot name="subtitle" />
          </p>
        </IonRow>
        <IonRow class="flex-1 px-8 ion-justify-content-center ion-align-items-center">
          <slot name="body" />
        </IonRow>
        <IonRow>
          <IonButton expand="block" class="w-full font-bold" @click="handleGoTo">
            Go to BonusNIM
          </IonButton>
        </IonRow>
      </IonGrid>
    </IonContent>
  </IonPage>
</template>
