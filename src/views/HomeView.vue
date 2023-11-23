<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFooter, IonGrid, IonHeader, IonIcon, IonList, IonPage, IonRow, IonToolbar, isPlatform } from '@ionic/vue'
import { chevronForward } from 'ionicons/icons'
import type { Ref } from 'vue'
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { Browser } from '@capacitor/browser'
import { StatusBar, Style } from '@capacitor/status-bar'
import { storeToRefs } from 'pinia'
import { Modal, useModal } from '@/composables/useModal'
import TransactionCard from '@/components/TransactionCard.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import MenuIcon from '@/components/icons/menu.vue'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { usePoints } from '@/stores/points'
import { useFiat } from '@/stores/fiat'

// TODO: lazy load
import NotificationCard from '@/components/NotificationCard.vue'
import { useTransactions } from '@/stores/transactions'
import { useNimiqNetwork } from '@/stores/useNimiqNetwork'
import { useSync } from '@/composables/useSync'

const router = useRouter()
const { showModal, showNotificationAlert } = useModal()

const { isRemoteOk, isHtlcActive, remoteBalance } = storeToRefs(useRemoteSigner())
const { phoneNumber, referralCode, hasDoneBackup } = storeToRefs(useApp())
const { locked, dbExists } = storeToRefs(useConn())
const { pointsBalance } = storeToRefs(usePoints())
const { formatCurrency, getPriceAt, getPriceNow } = useFiat()
const { transactions } = storeToRefs(useTransactions())
const { head } = storeToRefs(useNimiqNetwork())

const notificationList: Ref<HTMLUListElement | undefined> = ref()
const isReferralCardShown = ref(true)
const isRecoveryWordsShown = computed(() => !hasDoneBackup.value && remoteBalance.value > 0)
const currentPrice = ref(0)
// TODO: do we need to update that frequently?
watch(head, async () => {
  const { data: price, error } = (await getPriceNow())
  if (error || !price) {
    console.error('Error getting price now', error)
    return
  }
  currentPrice.value = price / 1000
})
// TODO: get this from API
const referralRewardAmount = 10
// TODO: get this from somewhere
const notificationArray = ref([
  {
    title: 'Alpha Testing',
    subtitle: 'This is in alpha, please report any bugs and remember to use only TestNIM',
    action: () => console.log('Notification Card 2 clicked'),
  },
  {
    title: 'Buy NIM with Credit Card',
    action: () => Browser.open({ url: 'https://buy.simplex.com/' }),
  },
  // {
  //   title: 'Notification Card 3',
  //   subtitle: 'Subtitle',
  //   action: () => console.log('Notification Card 3 clicked'),
  // },
  // {
  //   title: 'Notification Card 4',
  //   subtitle: 'Subtitle',
  //   action: () => console.log('Notification Card 4 clicked'),
  // },
  // {
  //   title: 'Notification Card 5',
  //   subtitle: 'Subtitle',
  //   action: () => console.log('Notification Card 5 clicked'),
  // },
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
    console.log('Ready:', isRemoteOk.value)
    // eslint-disable-next-line no-console
    console.log('Valid:', isHtlcActive.value)
    // eslint-disable-next-line no-console
    console.log('Balance:', remoteBalance.value)
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

  if (referralCode.value && phoneNumber.value) {
    setTimeout(() => {
      showNotificationAlert('CC Points added')
    }, 750)
  }
  else if (!referralCode.value && !phoneNumber.value) {
    notificationArray.value.unshift({
      title: verifyNumberTitle,
      subtitle: 'Get cashback and earn rewards',
      action: () => showModal(Modal.NewPhone),
    })
    scrollToFirstNotification()
  }
  else if (referralCode.value && !phoneNumber.value) {
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
  if (!dbExists.value) {
    // eslint-disable-next-line no-console
    console.log('No DB found, redirecting to setup')
    await router.replace('/setup')
    return
  }
  if (locked.value) {
    // eslint-disable-next-line no-console
    console.log('DB locked, redirecting to pin')
    await router.replace('/pin')
    return
  }

  scrollToFirstNotification()

  await useRemoteSigner().init()
  useSync().syncWallets()
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
            @click="phoneNumber ? showModal(Modal.Rewards) : showModal(Modal.NewPhone)"
          >
            <CryptoCityLogo slot="start" class="w-5 h-5 mr-2" />
            {{
              phoneNumber ? pointsBalance / 1e5 : 'Earn Points'
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
            {{ formatCurrency(remoteBalance / 1e5 * currentPrice) }}
          </h1>
          <p class="text-base font-semibold text-space/60">
            <span>
              {{ Math.floor(remoteBalance / 1e5).toFixed(2) }} NIM
            </span>
            <!-- TODO: add price change in last 24 hours -->
            <!-- <IonIcon slot="start" :icon="fiatHandler.priceChange.value > 0 ? trendingUp : trendingDown" class="ml-4" /> -->
            <!-- <span class="ml-1">{{ Math.round(fiatHandler.priceChange.value * 10000) / 100 }}%</span> -->
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
        <IonList v-if="transactions.length" lines="none" class="mb-6 bg-transparent">
          <TransactionCard
            v-for="transaction in transactions.slice(0, 3)" :key="transaction.hash"
            :tx="transaction"
          />
          <div v-if="transactions.length > 3" class="text-center">
            <IonButton
              fill="clear" class="text-base normal-case text-sky"
              @click="showModal(Modal.TransactionHistory)"
            >
              See all
              <IonIcon slot="end" class="text-space/50" :icon="chevronForward" />
            </IonButton>
          </div>
        </IonList>

        <!-- Notification Horizontal Scroll -->
        <IonRow v-if="notificationArray.length">
          <ul
            ref="notificationList"
            class="flex min-w-[100vw] overflow-x-auto hide-scrollbar items-center snap-x snap-mandatory gap-x-3 last:pr-96 scroll-pl-4 pb-4"
          >
            <li v-for="(notification, index) in notificationArray" :key="notification.title" class="h-full">
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
            @click="phoneNumber ? showModal(Modal.Referral) : showModal(Modal.NewPhone)"
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
          :disabled="!(isRemoteOk && isHtlcActive) || !(pointsBalance > 0 || remoteBalance > 0)"
          @click="showModal(Modal.Pay, { isFullscreen: true })"
        >
          Scan To Pay
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
