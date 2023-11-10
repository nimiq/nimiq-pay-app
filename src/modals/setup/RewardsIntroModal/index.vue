<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonNav, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { markRaw, ref } from 'vue'
import type { Ref } from 'vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import Tab1 from './Tab1.vue'
import Tab2 from './Tab2.vue'
import Tab3 from './Tab3.vue'
import NavBar from '@/components/NavBar.vue'
import { useModal } from '@/composables/useModal'

const { closeModal } = useModal()
const activeTab = ref(0)
// const nav = (document.querySelector('[data-reward-info-nav]')) as Nav & HTMLElement
const nav: Ref<{ $el: Nav } | undefined> = ref()
const tabList = [
  markRaw(Tab1),
  markRaw(Tab2),
  markRaw(Tab3),
]

async function handleNavigate(index?: number) {
  if (index !== undefined)
    await nav.value?.$el.push(tabList[index], undefined, { direction: activeTab.value > index ? 'back' : 'forward', mode: 'ios' })

  const active = await nav.value?.$el.getActive()
  if (!active)
    activeTab.value = 0
  else
    activeTab.value = tabList.findIndex(tab => tab === active.component)
}
</script>

<template>
  <IonHeader class="ion-no-border">
    <!-- <NavBar :count="tabList.length" :active="activeTab" @navigate="handleNavigate" /> -->
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click="() => closeModal()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonNav ref="nav" data-reward-info-nav :root="markRaw(Tab1)" @ion-nav-did-change="() => handleNavigate()" />
</template>
