<script setup lang="ts">
import { IonButton, IonButtons, IonCol, IonContent, IonFooter, IonGrid, IonHeader, IonIcon, IonList, IonMenuButton, IonPage, IonRow, IonToolbar, isPlatform } from '@ionic/vue'
import { chevronForward, trendingDown, trendingUp } from 'ionicons/icons'
import type { Ref } from 'vue'
import { inject, onMounted, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { Browser } from '@capacitor/browser'
import { StatusBar, Style } from '@capacitor/status-bar'
import { storeToRefs } from 'pinia'
import { BonusWallet } from '@/lib/bonus-wallet'
import { StorageManager } from '@/lib/storage-manager'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { FiatHandler } from '@/lib/fiat-handler'
import { Modal, useModal } from '@/composables/useModal'
import TaskCard from '@/components/TaskCard.vue'
import TransactionCard from '@/components/TransactionCard.vue'

// TODO: lazy load
import NotificationCard from '@/components/NotificationCard.vue'
import { useApp } from '@/stores/app'

const { showRecoveryWordsAlert } = storeToRefs(useApp())
const router = useRouter()
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const storageManager = inject(StorageManager.KEY) as StorageManager
const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const fiatHandler = inject(FiatHandler.KEY) as FiatHandler
const { showModal, showNotificationAlert } = useModal()
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

if (import.meta.env.DEV) {
  watchEffect(() => {
    // eslint-disable-next-line no-console
    console.groupCollapsed('👛 Instant Pay Wallet')
    // eslint-disable-next-line no-console
    console.log('Ready:', instantPayWallet.ready.value)
    // eslint-disable-next-line no-console
    console.log('Valid:', instantPayWallet.valid.value)
    // eslint-disable-next-line no-console
    console.log('Balance:', instantPayWallet.balance.value)
    // eslint-disable-next-line no-console
    console.groupEnd()
  })
}

watchEffect(async () => {
  const verifyNumberTitle = 'Verify your phone number to get cashback and earn rewards'
  const claimRewardTitle = 'You have 5€ reward to claim!'
  // Remove custom notifications and add them later if necessary
  notificationArray.value = notificationArray.value.filter((notification) => {
    return notification.title !== verifyNumberTitle && notification.title !== claimRewardTitle
  })

  // eslint-disable-next-line no-console
  console.groupCollapsed('👤 User Info')
  // eslint-disable-next-line no-console
  console.log('isPhoneRegistered', isPhoneRegistered.value)
  // eslint-disable-next-line no-console
  console.log('isPromoCodeEntered', isPromoCodeEntered.value)
  // eslint-disable-next-line no-console
  console.groupEnd()
  if (isPromoCodeEntered.value && isPhoneRegistered.value) {
    setTimeout(() => {
      showNotificationAlert({ title: 'You got CC Points!', message: `${bonusAmount} €`, extra: `${(bonusAmount / fiatHandler.price.value).toFixed(2)} NIM` })
    }, 750)
  }
  else if (!isPromoCodeEntered.value && !isPhoneRegistered.value) {
    notificationArray.value.unshift({
      title: verifyNumberTitle,
      action: () => showModal(Modal.NewPhone),
    })
    scrollToFirstNotification()
  }
  else if (isPromoCodeEntered.value && !isPhoneRegistered.value) {
    notificationArray.value.unshift({
      title: claimRewardTitle,
      action: () => showModal(Modal.NewPhone),
    })
    scrollToFirstNotification()
  }
})

watch(showRecoveryWordsAlert, () => {
  StatusBar.setStyle({ style: Style.Light })
  StatusBar.setBackgroundColor({ color: showRecoveryWordsAlert.value ? '#dbeafe' : '#ffffff' })
}, { immediate: true })

onMounted(async () => {
  // TODO: if no storage, go to setup
  if (!storageManager.isUnlocked()) {
    await router.replace('/pin')
    return
  }

  bonusWallet.checkDelayedRedeemVoucher()
  scrollToFirstNotification()
})
</script>

<template>
  <IonPage>
    <IonHeader class="ion-no-border">
      <IonToolbar v-if="isRecoveryWordsShown" class="px-1 bg-blue-100" :class="{ 'pb-2 mb-2': isPlatform('ios') }">
        <div slot="start" class="flex items-center gap-2 ml-2">
          <div class="w-3 h-3 bg-blue-600 rounded-full" />
          <p class="font-semibold">
            There is no 'forgot password'
          </p>
        </div>
        <IonButtons slot="end">
          <IonButton fill="solid" class="font-bold" size="small" @click="showModal(Modal.Backup)">
            Recovery Words
          </IonButton>
        </IonButtons>
      </IonToolbar>
      <IonToolbar class="px-2">
        <IonButtons slot="start">
          <IonMenuButton :auto-hide="false" @click="showModal(Modal.Menu, { isSmall: true })" />
        </IonButtons>
        <IonButtons v-if="isPhoneRegistered" slot="end">
          <IonButton fill="solid" class="font-bold" style="--padding-start: 0.75rem; --padding-bottom: 0.4rem; --padding-top: 0.4rem" @click="showModal(Modal.Rewards)">
            Earn CC Points
            <IonIcon slot="end" :icon="chevronForward" />
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding scroll-smooth">
      <IonGrid class="flex flex-col gap-y-2">
        <!-- Balance -->
        <IonRow class="flex flex-col items-center justify-center h-[40vh] transition-all" :class="instantPayWallet.transactions.value.length && '!h-[30vh]'">
          <h1 class="mb-3 text-5xl font-normal">
            {{ fiatHandler.currencyPrefix.value }}{{ (Math.floor(instantPayWallet.balance.value * fiatHandler.price.value * 100) / 100).toFixed(2) }}{{ fiatHandler.currencySuffix.value }}
          </h1>
          <p class="text-lg text-blue-300">
            {{ Math.floor(instantPayWallet.balance.value).toFixed(2) }} NIM
            <IonIcon slot="start" :icon="fiatHandler.priceChange.value > 0 ? trendingUp : trendingDown" class="ml-3" />
            <span class="ml-1 font-semibold">{{ Math.round(fiatHandler.priceChange.value * 10000) / 100 }}%</span>
          </p>
          <IonButton fill="clear" class="text-xl font-medium" @click="showModal(Modal.TopUp, { isSmall: true })">
            Top Up <IonIcon slot="end" :icon="chevronForward" />
          </IonButton>
        </IonRow>

        <!-- TX History -->
        <IonList v-if="instantPayWallet.transactions.value.length" lines="none" class="mb-6">
          <TransactionCard v-for="transaction in instantPayWallet.transactions.value.slice(0, 3)" :key="transaction.id" :tx="transaction" />
          <div v-if="instantPayWallet.transactions.value.length > 3" class="text-center">
            <IonButton fill="clear" @click="showModal(Modal.TransactionHistory)">
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
          <TaskCard highlight large @click="showModal(Modal.Voucher)">
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
          <IonButton fill="clear" @click="Browser.open({ url: 'https://map.nimiq.com/', toolbarColor: '#fff' })">
            Go to map
            <IonIcon slot="end" :icon="chevronForward" />
          </IonButton>
        </IonRow>
      </IonGrid>
    </IonContent>
    <IonFooter>
      <IonToolbar>
        <IonGrid>
          <IonRow class="ion-justify-content-center">
            <IonCol size="8">
              <IonButton
                style="--box-shadow: none;"
                expand="block" :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || instantPayWallet.balance.value === 0"
                @click="showModal(Modal.Pay, { isFullscreen: true })"
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
