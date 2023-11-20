<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFooter, IonGrid, IonHeader, IonIcon, IonList, IonPage, IonRow, IonToolbar, isPlatform } from '@ionic/vue'
import { chevronForward, trendingDown, trendingUp } from 'ionicons/icons'
import type { Ref } from 'vue'
import { computed, inject, onMounted, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { Browser } from '@capacitor/browser'
import { StatusBar, Style } from '@capacitor/status-bar'
import { computedAsync } from '@vueuse/core'
import { BonusWallet } from '@/lib/bonus-wallet'
import { StorageManager } from '@/lib/storage-manager'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import { FiatHandler } from '@/lib/fiat-handler'
import { Modal, useModal } from '@/composables/useModal'
import TransactionCard from '@/components/TransactionCard.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import MenuIcon from '@/components/icons/menu.vue'

// TODO: lazy load
import NotificationCard from '@/components/NotificationCard.vue'

const router = useRouter()
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const storageManager = inject(StorageManager.KEY) as StorageManager
const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const nimiqNetworkClient = inject(NimiqNetworkClient.KEY) as NimiqNetworkClient
const fiatHandler = inject(FiatHandler.KEY) as FiatHandler
const { showModal, showNotificationAlert } = useModal()
const isPromoCodeEntered = bonusWallet.isPromoCodeEntered()
const isPhoneRegistered = bonusWallet.isRegistered()
const notificationList: Ref<HTMLUListElement | undefined> = ref()
const isRecoveryWordsShown = computed(() => !storageManager.isBackupDone().value && instantPayWallet.balance.value > 0)
// TODO: remove this and use a store for pointsBalance
// This should be updated every time there is a task claimed
const pointsBalance = computedAsync(async () => {
  console.log('height:', nimiqNetworkClient.head.value?.height)
  return await bonusWallet.getParticipantBalance()
}, 0)
const isReferralCardShown = ref(true)
// TODO: get this from API
const referralRewardAmount = 10
// TODO: get this from somewhere
const notificationArray = ref([
  {
    title: 'Buy NIM with Credit Card',
    action: () => Browser.open({ url: 'https://buy.simplex.com/' }),
  },
  {
    title: 'Notification Card 2',
    subtitle: 'Subtitle',
    action: () => console.log('Notification Card 2 clicked'),
  },
  {
    title: 'Notification Card 3',
    subtitle: 'Subtitle',
    action: () => console.log('Notification Card 3 clicked'),
  },
  {
    title: 'Notification Card 4',
    subtitle: 'Subtitle',
    action: () => console.log('Notification Card 4 clicked'),
  },
  {
    title: 'Notification Card 5',
    subtitle: 'Subtitle',
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
  const verifyNumberTitle = 'Verify your phone number'
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
      showNotificationAlert('CC Points added')
    }, 750)
  }
  else if (!isPromoCodeEntered.value && !isPhoneRegistered.value) {
    notificationArray.value.unshift({
      title: verifyNumberTitle,
      subtitle: 'Get cashback and earn rewards',
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

watch(isRecoveryWordsShown, () => {
  // If no backup done and balance > 0
  if (isRecoveryWordsShown.value) {
    StatusBar.setBackgroundColor({ color: '#dbeafe' })
    StatusBar.setStyle({ style: Style.Light })
  }
  else {
    StatusBar.setBackgroundColor({ color: '#F8F8F8' })
    StatusBar.setStyle({ style: Style.Light })
  }
}, { immediate: true })

onMounted(async () => {
  if (!(await storageManager.exists())) {
    await router.replace('/setup')
    return
  }
  if (!storageManager.isUnlocked()) {
    await router.replace('/pin')
    return
  }

  if (await storageManager.isFirstRun()) {
    await storageManager.setFirstRun(false)
    showModal(Modal.RewardsIntro)
  }

  // bonusWallet.checkDelayedRedeemVoucher()
  scrollToFirstNotification()
})
</script>

<template>
  <IonPage class="bg-[#F8F8F8]">
    <IonHeader class="ion-no-border">
      <IonToolbar v-if="isRecoveryWordsShown" class="px-1 bg-blue-100" :class="{ 'pb-2 mb-2': isPlatform('ios') }">
        <div slot="start" class="flex items-center gap-2 ml-2">
          <div class="w-3 h-3 bg-blue-600 rounded-full" />
          <p class="font-semibold">
            There is no 'forgot password'
          </p>
        </div>
        <IonButtons slot="end">
          <IonButton
            fill="solid" class="font-bold normal-case" style="--background: var(--radial-gradient-light-blue)"
            size="small" @click="showModal(Modal.Backup)"
          >
            Recovery Words
          </IonButton>
        </IonButtons>
      </IonToolbar>
      <IonToolbar class="px-2">
        <IonButtons slot="start">
          <IonButton @click="showModal(Modal.Menu, { isSmall: true })">
            <MenuIcon class="h-5 w-7 opacity-30" />
          </IonButton>
        </IonButtons>
        <IonButtons slot="end">
          <IonButton
            class="text-base normal-case"
            style="--background: var(--colors-darkblue-6); --color: var(--colors-darkblue); --padding-top: 9px; --padding-bottom: 10px;"
            @click="isPhoneRegistered ? showModal(Modal.Rewards) : showModal(Modal.NewPhone)"
          >
            <CryptoCityLogo slot="start" class="w-5 h-5 mr-2" />
            {{
              isPhoneRegistered ? pointsBalance / 1e5 : 'Earn Points'
            }}
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding scroll-smooth">
      <!-- TODO: replace with an html grid -->
      <IonGrid class="flex flex-col gap-y-2">
        <!-- Balance -->
        <IonRow class="flex flex-col items-center justify-center h-[30vh] transition-all">
          <h1 class="mb-2 text-5xl font-normal">
            {{ fiatHandler.currencyPrefix.value }} {{ (Math.floor(instantPayWallet.balance.value * fiatHandler.price.value
              * 100) / 100).toFixed(2) }}{{ fiatHandler.currencySuffix.value }}
          </h1>
          <p class="text-base font-semibold text-space/60">
            <span>
              {{ Math.floor(instantPayWallet.balance.value).toFixed(2) }} NIM
            </span>
            <IonIcon slot="start" :icon="fiatHandler.priceChange.value > 0 ? trendingUp : trendingDown" class="ml-4" />
            <span class="ml-1">{{ Math.round(fiatHandler.priceChange.value * 10000) / 100 }}%</span>
          </p>
          <IonButton
            fill="clear" class="text-base normal-case text-sky"
            @click="showModal(Modal.TopUp, { isSmall: true })"
          >
            Top up
            <IonIcon slot="end" class="text-space/50" :icon="chevronForward" />
          </IonButton>
        </IonRow>

        <!-- TX History -->
        <IonList v-if="instantPayWallet.transactions.value.length" lines="none" class="mb-6 bg-transparent">
          <TransactionCard
            v-for="transaction in instantPayWallet.transactions.value.slice(0, 3)" :key="transaction.id"
            :tx="transaction"
          />
          <div v-if="instantPayWallet.transactions.value.length > 3" class="text-center">
            <IonButton
              fill="clear" class="text-base normal-case text-sky"
              @click="showModal(Modal.TransactionHistory)"
            >
              See all
              <IonIcon slot="end" class="text-space/50" :icon="chevronForward" />
            </IonButton>
          </div>
        </IonList>

        <!-- Horizontal Scroll -->
        <IonRow v-if="notificationArray.length">
          <ul
            ref="notificationList"
            class="flex items-end min-w-[100vw] overflow-x-auto hide-scrollbar snap-x snap-mandatory gap-x-3 last:pr-96 scroll-pl-4 pb-4"
          >
            <li v-for="(notification, index) in notificationArray" :key="notification.title">
              <NotificationCard @click="notification.action" @close="() => removeNotification(index)">
                {{ notification.title }}
                <template #subtitle>
                  {{ notification.subtitle }}
                </template>
              </NotificationCard>
            </li>
          </ul>
        </IonRow>

        <!-- Referral -->
        <IonRow v-if="isReferralCardShown" class="mb-8">
          <NotificationCard
            class="w-full"
            @click="isPhoneRegistered ? showModal(Modal.Referral) : showModal(Modal.NewPhone)"
            @close="isReferralCardShown = false"
          >
            <span class="text-lg text-pumpkin">
              Bring a friend and get {{ referralRewardAmount }} Points each!
            </span>
          </NotificationCard>
        </IonRow>

        <!-- Map -->
        <IonRow>
          <p class="ml-1 text-lg font-semibold">
            Find places that accept crypto!
          </p>
        </IonRow>
        <IonRow>
          <div class="flex items-center justify-center w-full mt-2 bg-blue-200 rounded-lg h-72">
            <span class="text-blue-50">Map</span>
          </div>
        </IonRow>
        <IonRow class="ion-justify-content-center">
          <IonButton
            fill="clear" class="text-base normal-case"
            @click="Browser.open({ url: 'https://map.nimiq.com/', toolbarColor: '#fff' })"
          >
            Go to Crypto Map
            <IonIcon slot="end" class="text-space/50" :icon="chevronForward" />
          </IonButton>
        </IonRow>
      </IonGrid>
    </IonContent>

    <!-- Footer -->
    <IonFooter>
      <IonToolbar>
        <IonButton
          class="w-3/4 mx-auto text-base" expand="block"
          :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || !(pointsBalance > 0 || instantPayWallet.balance.value > 0)"
          @click="showModal(Modal.Pay, { isFullscreen: true })"
        >
          Pay
        </IonButton>
      </IonToolbar>
    </IonFooter>
  </IonPage>
</template>

<style scoped>
/* Disable scrollbar */
ion-content {
  --offset-bottom: auto !important;
  --overflow: hidden;
  overflow: auto;

  &::-webkit-scrollbar {
    display: none;
  }
}

ion-footer>ion-toolbar {
  --background: white;
  --padding-top: 8px;
  --padding-bottom: 8px;
  box-shadow: 0px 0px 4.12454px 0px rgba(31, 35, 72, 0.03), 0px 0px 12.51868px 0px rgba(31, 35, 72, 0.05), 0px 0px 32.00036px 0px rgba(31, 35, 72, 0.06), 0px 0px 80px 0px rgba(31, 35, 72, 0.07);
}

.footer-md {
  box-shadow: none;
}
</style>
