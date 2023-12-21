<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFooter, IonGrid, IonHeader, IonIcon, IonPage, IonRefresher, IonRefresherContent, IonRow, IonToolbar, isPlatform } from '@ionic/vue'
import { chevronForward } from 'ionicons/icons'
import type { Ref } from 'vue'
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { Browser } from '@capacitor/browser'
import { StatusBar, Style } from '@capacitor/status-bar'
import { storeToRefs } from 'pinia'
import { Modal, useModal } from '@/composables/useModal'
import { useToast } from '@/composables/useToast'
import TransactionItem from '@/components/TransactionItem.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import MenuIcon from '@/components/icons/menu.vue'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { usePoints } from '@/stores/points'
import TheHomeAmounts from '@/components/TheHomeAmounts.vue'
import QuickButton from '@/components/QuickButton.vue'

// TODO: lazy load
import NotificationCard from '@/components/NotificationCard.vue'
import { useTransactions } from '@/stores/transactions'
import { useSync } from '@/composables/useSync'
import { useDevice } from '@/composables/useDevice'
import { FlowName } from '@/lib/flows/steps.types'
import { initializeFlow } from '@/lib/flows'

const router = useRouter()
const { showModal } = useModal()
const { setToast } = useToast()

const { isRemoteOk, isHtlcActive, remoteBalance } = storeToRefs(useRemoteSigner())
const { phoneNumberVerified, referralCode, hasDoneBackup } = storeToRefs(useApp())
const { locked, dbExists } = storeToRefs(useConn())
const { pointsBalance } = storeToRefs(usePoints())
const { updatePointsBalance, updateTasks } = usePoints()
const { transactions } = storeToRefs(useTransactions())

const notificationList: Ref<HTMLUListElement | undefined> = ref()
const isReferralCardShown = ref(true)
const isRecoveryWordsShown = computed(() => !hasDoneBackup.value && remoteBalance.value > 0)

// TODO: get this from API
const referralRewardAmount = 10
// TODO: get this from somewhere
const notificationArray = ref([
  {
    title: 'Welcome to Nimiq',
    subtitle: 'Your wallet is ready to use',
    action: () => initializeFlow(FlowName.OnBoardingPoints),
  },
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function handleRefresh(event: CustomEvent) {
  await Promise.all([
    sleep(2000),
    updatePointsBalance(),
    useSync().updateBalances(),
    useSync().updateTransactionHistory(),
  ])
  await useSync().verifyRemoteSignersDb()
  event.detail.complete()
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

  if (referralCode.value && phoneNumberVerified.value) {
    setTimeout(() => {
      setToast({ message: 'CC Points added' })
    }, 750)
  }
  else if (!referralCode.value && !phoneNumberVerified.value) {
    notificationArray.value.unshift({
      title: verifyNumberTitle,
      subtitle: 'Get cashback and earn rewards',
      action: () => initializeFlow(FlowName.VerifyPhone),
    })
    scrollToFirstNotification()
  }
  else if (referralCode.value && !phoneNumberVerified.value) {
    notificationArray.value.unshift({
      title: claimRewardTitle,
      action: () => initializeFlow(FlowName.VerifyPhone),
    })
    scrollToFirstNotification()
  }
})

watch(isRecoveryWordsShown, () => {
  if (useDevice().isWeb)
    return
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

  if (phoneNumberVerified.value) {
    updatePointsBalance()
    updateTasks()
  }

  scrollToFirstNotification()
  await useSync().syncWallets()
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
            @click="phoneNumberVerified ? showModal(Modal.Points) : initializeFlow(FlowName.VerifyPhone)"
          >
            <CryptoCityLogo slot="start" class="w-5 h-5 mr-2" />
            {{
              phoneNumberVerified ? pointsBalance / 1e5 : 'Earn Points'
            }}
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding scroll-smooth">
      <IonRefresher slot="fixed" @ion-refresh="handleRefresh($event)">
        <IonRefresherContent />
      </IonRefresher>

      <TheHomeAmounts class="mt-[72px]" />

      <QuickButton show-chevron center @click="initializeFlow(FlowName.NimTopUp)">
        Top Up
      </QuickButton>

      <ol v-if="transactions.length">
        <li v-for="tx in transactions.slice(0, 3)" :key="tx.hash">
          <TransactionItem :tx="tx" @click="initializeFlow(FlowName.ViewTransactionDetail, { transactionList: tx })" />
        </li>
      </ol>

      <QuickButton v-if="transactions.length > 3" show-chevron center @click="initializeFlow(FlowName.ViewTransactions)">
        See all
      </QuickButton>

      <!-- TODO: replace with an html grid -->
      <IonGrid class="flex flex-col mt-10 gap-y-2">
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
            @click="phoneNumberVerified ? showModal(Modal.Referral) : initializeFlow(FlowName.VerifyPhone)"
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
          <!-- TODO: add info icon -->
          <!-- TODO: update minutes when blocks are less than 10 mins -->
          <Transition name="slide-fade">
            <p v-if="!isHtlcActive" class="p-2 text-base font-semibold text-center text-pumpkin">
              Wait ~10 minutes to pay after Top Up
            </p>
          </Transition>
          <IonButton
          class="w-3/4 mx-auto text-base" expand="block"
          :disabled="pointsBalance === 0 && (!(isRemoteOk && isHtlcActive) || remoteBalance === 0)"
          @click="initializeFlow(FlowName.NimOrPointsPayment)"
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
