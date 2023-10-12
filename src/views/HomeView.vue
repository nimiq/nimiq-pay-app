<script setup lang="ts">
import { IonButton, IonButtons, IonCol, IonContent, IonFooter, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonPage, IonRow, IonText, IonToolbar } from '@ionic/vue'
import { basket, chevronForwardOutline, trendingUpOutline } from 'ionicons/icons'
import type { Ref } from 'vue'
import { inject, onMounted, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { BonusWallet } from '@/lib/bonus-wallet'
import { StorageManager } from '@/lib/storage-manager'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { FiatHandler } from '@/lib/fiat-handler'
import { ModalType, useModal } from '@/composables/useModal'
import TaskCard from '@/components/TaskCard.vue'
import TransactionCard from '@/components/TransactionCard.vue'
import MenuModal from '@/modals/MenuModal.vue'

// TODO: lazy load
import NotificationCard from '@/components/NotificationCard.vue'
import NotificationAlert from '@/components/NotificationAlert.vue'

const router = useRouter()
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const storageManager = inject(StorageManager.KEY) as StorageManager
const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const fiatHandler = inject(FiatHandler.KEY) as FiatHandler
const { showModal, showNotificationAlert } = useModal()
const isPromoCodeEntered = bonusWallet.isPromoCodeEntered()
const isPhoneRegistered = bonusWallet.isRegistered()
const bonusModal: Ref<{ $el: HTMLIonModalElement } | undefined> = ref()
const notificationList: Ref<HTMLUListElement | undefined> = ref()
// TODO: get this from API
const bonusAmount = 5
// TODO: get this from somewhere
const notificationArray = ref([
  {
    title: 'Notification Card 1',
    action: () => console.log('Notification Card 1 clicked'),
  },
  {
    title: 'Notification Card 2',
    action: () => console.log('Notification Card 2 clicked'),
  },
  {
    title: 'Notification Card 3',
    action: () => console.log('Notification Card 3 clicked'),
  },
  {
    title: 'Notification Card 4',
    action: () => console.log('Notification Card 4 clicked'),
  },
  {
    title: 'Notification Card 5',
    action: () => console.log('Notification Card 5 clicked'),
  },
])

function removeNotification(index: number) {
  notificationArray.value.splice(index, 1)
}

function scrollToFirstNotification() {
  // Scroll to first notification
  notificationList.value?.scrollTo({
    left: notificationList.value.scrollWidth * -1,
    behavior: 'smooth',
  })
}

watchEffect(async () => {
  const verifyNumberTitle = 'Verify your phone number to get cashback and earn rewards'
  const claimRewardTitle = 'You have 5€ reward to claim!'
  // Remove custom notifications and add them later if necessary
  notificationArray.value = notificationArray.value.filter((notification) => {
    return notification.title !== verifyNumberTitle && notification.title !== claimRewardTitle
  })

  console.log('isPhoneRegistered', isPhoneRegistered.value)
  console.log('isPromoCodeEntered', isPromoCodeEntered.value)
  if (isPromoCodeEntered.value && isPhoneRegistered.value) {
    setTimeout(() => {
      showNotificationAlert(bonusModal)
    }, 750)
  }
  else if (!isPromoCodeEntered.value && !isPhoneRegistered.value) {
    notificationArray.value.unshift({
      title: verifyNumberTitle,
      action: () => showModal(ModalType.NewPhone),
    })
    scrollToFirstNotification()
  }
  else if (isPromoCodeEntered.value && !isPhoneRegistered.value) {
    notificationArray.value.unshift({
      title: claimRewardTitle,
      action: () => showModal(ModalType.NewPhone),
    })
    scrollToFirstNotification()
  }
})

onMounted(async () => {
  if (!storageManager.isUnlocked())
    router.replace('/pin')

  scrollToFirstNotification()
})
</script>

<template>
  <IonPage>
    <IonHeader class="px-2 ion-no-border">
      <IonToolbar>
        <IonButtons slot="start">
          <IonMenuButton id="main-menu-button" :auto-hide="false" />
        </IonButtons>
        <IonButtons v-if="isPhoneRegistered" slot="end">
          <IonButton fill="solid" class="font-bold" style="--padding-start: 0.75rem; --padding-bottom: 0.4rem; --padding-top: 0.4rem" @click="showModal(ModalType.Rewards)">
            Earn BonusNIM
            <IonIcon slot="end" :icon="chevronForwardOutline" />
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding scroll-smooth">
      <IonGrid class="flex flex-col gap-y-2">
        <!-- Balance -->
        <IonRow class="flex flex-col items-center justify-center h-[40vh] transition-all" :class="instantPayWallet.transactions.value.length && '!h-[30vh]'">
          <h1 class="mb-3 text-5xl font-normal">
            {{ (Math.floor(instantPayWallet.balance.value * fiatHandler.price.value * 100) / 100).toFixed(2) }} €
          </h1>
          <p class="text-lg text-blue-300">
            {{ Math.floor(instantPayWallet.balance.value).toFixed(2) }} NIM
            <IonIcon slot="start" :icon="trendingUpOutline" class="ml-3" />
            <span class="ml-1 font-semibold">{{ Math.round(fiatHandler.priceChange.value * 1000) / 10 }}%</span>
          </p>
          <IonButton fill="clear" class="text-xl font-medium">
            Top Up <IonIcon slot="end" :icon="chevronForwardOutline" />
          </IonButton>
        </IonRow>

        <!-- TX History -->
        <IonList v-if="instantPayWallet.transactions.value.length" lines="none" class="mb-6">
          <TransactionCard v-for="transaction in instantPayWallet.transactions.value.slice(0, 3)" :key="transaction.id" :tx="transaction" />
          <div v-if="instantPayWallet.transactions.value.length > 3" class="text-center">
            <IonButton fill="clear" @click="showModal(ModalType.TransactionHistory)">
              See more
            </IonButton>
          </div>
        </IonList>

        <!-- Horizontal Scroll -->
        <IonRow v-if="notificationArray.length">
          <ul ref="notificationList" class="flex items-end min-w-[100vw] overflow-x-auto hide-scrollbar snap-x snap-mandatory gap-x-3 last:pr-96 scroll-pl-4 mb-4">
            <li v-for="(notification, index) in notificationArray" :key="notification.title">
              <NotificationCard @click="notification.action" @close="() => removeNotification(index)">
                {{ notification.title }}
              </NotificationCard>
            </li>
          </ul>
        </IonRow>
        <!-- Referral -->
        <IonRow class="mb-8">
          <TaskCard highlight large>
            Invite a friend and earn up to 20€ both!
          </TaskCard>
        </IonRow>

        <!-- Map -->
        <IonRow>
          <p class="ml-1 text-lg font-semibold">
            Find places that accept crypto
          </p>
        </IonRow>
        <IonRow>
          <div class="flex items-center justify-center w-full mt-2 bg-blue-200 rounded-lg h-72">
            <span class="text-blue-50">Map</span>
          </div>
        </IonRow>
        <IonRow class="ion-justify-content-center">
          <IonButton fill="clear">
            Go to map
            <IonIcon slot="end" :icon="chevronForwardOutline" />
          </IonButton>
        </IonRow>
      </IonGrid>

      <!-- Menu Modal -->
      <MenuModal />

      <!-- BonusNIM Modal -->
      <NotificationAlert ref="bonusModal">
        <template #title>
          You got BonusNIM!
        </template>
        <template #body>
          {{ bonusAmount }}€
        </template>
        <template #extra>
          {{ (bonusAmount / fiatHandler.price.value).toFixed(2) }} NIM
        </template>
      </NotificationAlert>
    </IonContent>
    <IonFooter>
      <IonToolbar>
        <IonGrid>
          <IonRow class="ion-justify-content-center">
            <IonCol size="8">
              <IonButton
                style="--box-shadow: none;"
                expand="block" :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || instantPayWallet.balance.value === 0"
                @click="showModal(ModalType.Pay, { isFullscreen: true })"
              >
                Pay
              </IonButton>
            </IonCol>
          </IonRow>
        </IonGrid>
      </IonToolbar>
    </IonFooter>
  </IonPage>
</template>

<style scoped>
/* Disable scrollbar */
ion-content {
  --offset-bottom: auto!important;
  --overflow: hidden;
  overflow: auto;
  &::-webkit-scrollbar {
    display: none;
  }
}

ion-footer > ion-toolbar {
  --border-color: rgb(59 130 246);
  --border-width: 1px 0 0 0;
  --border-style: solid;
}

.footer-md {
    box-shadow: none !important;
}
</style>
