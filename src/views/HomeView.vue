<script setup lang="ts">
import BackupNotification from '@/components/BackupNotification.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import InfoIcon from '@/components/icons/info.vue'
import MenuIcon from '@/components/icons/menu.vue'
import QuickButton from '@/components/QuickButton.vue'
import TheHomeAmounts from '@/components/TheHomeAmounts.vue'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { useNotifications } from '@/composables/useNotifications'
import { Crypto, useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { usePoints } from '@/stores/points'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSync } from '@/stores/sync'
import { useTransactions } from '@/stores/transactions'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Clipboard } from '@capacitor/clipboard'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { IonButton, IonButtons, IonContent, IonFooter, IonGrid, IonHeader, IonIcon, IonPage, IonRefresher, IonRefresherContent, IonRow, IonToolbar } from '@ionic/vue'
import { computedAsync, until, useElementSize, useSwipe } from '@vueuse/core'
import { chevronForward } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { computed, onMounted, type Ref, ref, watch, watchEffect } from 'vue'

import { useRouter } from 'vue-router'
// TODO: lazy load
import NotificationCard from '@/components/NotificationCard.vue'
import PaymentRequestDetectedNotification from '@/components/PaymentRequestDetectedNotification.vue'
import TheHomeTransactions from '@/components/TheHomeTransactions.vue'
import { toCoins } from '@/composables/usePrice'
import { i18n } from '@/i18n/i18n-setup'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'

const logger = useLogger('HomeView')

const router = useRouter()
const { showModal } = useModal()

const { localBalance } = storeToRefs(useLocalWallet())
const { isRemoteOk, isHtlcActive, remoteBalance, /* blocksUntilHtlcActive, */ remoteHeight } = storeToRefs(useRemoteSigner())
const { phoneNumberVerified, referralCode, hasDoneBackup, displayedPaymentRequests } = storeToRefs(useApp())
const { locked, dbExists } = storeToRefs(useConn())
const { pointsBalance } = storeToRefs(usePoints())
const { updatePointsBalance, updateTasks, updateStatus, redeemReferral, getReferralInfo } = usePoints()
const { transactions } = storeToRefs(useTransactions())
const { consensus, height: localHeight } = storeToRefs(useNimiqNetwork())
const { addLocalNotification, localNotifications, removeLocalNotification } = useNotifications()
const { nodesAreSynced, isTransactionPending, blocksUntilNextMacroBlock } = storeToRefs(useSync())
const { isProcessingRemote, isSyncingWallets, isUpdatingTransactions } = storeToRefs(useLocks())

const footerRef: Ref<HTMLIonFooterElement | undefined> = ref()
const footerHeight = useElementSize(footerRef).height
const notificationList: Ref<HTMLUListElement | undefined> = ref()
const isPaymentDisabled = computed(() => (pointsBalance.value === 0 && (!(isRemoteOk.value && isHtlcActive.value) || consensus.value !== 'established' || remoteBalance.value === 0)) || !nodesAreSynced.value || isProcessingRemote.value || isTransactionPending.value)
const isReferralCardShown = ref(true)
const isRecoveryWordsShown = computed(() => !hasDoneBackup.value)

// Payment Request Notification
const prNotificationRef = ref<HTMLDivElement | null>(null)
const detectedPaymentRequest = ref<string | null>('')
const { lengthX, isSwiping } = useSwipe(prNotificationRef, {
  threshold: 10,
  onSwipe: () => {
    if (lengthX.value > 0) {
      const distance = Math.abs(lengthX.value)
      prNotificationRef.value!.style.left = `-${distance}px`
      prNotificationRef.value!.style.opacity = `${1.25 - distance / prNotificationRef.value!.clientWidth}`
    }
    else {
      prNotificationRef.value!.style.left = '0'
      prNotificationRef.value!.style.opacity = '1'
    }
  },
  onSwipeEnd() {
    if (lengthX.value > 0 && (Math.abs(lengthX.value) / prNotificationRef.value!.clientWidth) >= 0.5) {
      prNotificationRef.value!.style.left = '-100%'
      prNotificationRef.value!.style.opacity = '0'
      detectedPaymentRequest.value = null
    }
    else {
      prNotificationRef.value!.style.left = '0'
      prNotificationRef.value!.style.opacity = '1'
    }
  },
})

const referralInfo = computedAsync(async () => {
  const { data, error } = await getReferralInfo()
  if (error) {
    logger.error('Error getting referral info:', error)
    return null
  }
  return data
})
const referralRewardAmount = computed(() => toCoins(referralInfo.value?.reward || 0, Crypto.NIM))
const referralClaimsRemaining = computed(() => referralInfo.value?.claims_remaining || 0)

function scrollToFirstNotification() {
  // Scroll to first notification
  notificationList.value?.scrollTo({
    left: notificationList.value.scrollWidth * -1,
    behavior: 'smooth',
  })
}

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

async function handleRefresh(event: CustomEvent) {
  logger.log('Manual refresh triggered')
  // TODO: add a loading variable from useSync and don't refresh if already loading
  await Promise.all([
    sleep(2000),
    updatePointsBalance(),
    updateStatus(),
    useSync().updateBalances(),
    useSync().updateTransactionHistory(),
  ])
  await useSync().verifyRemoteSignersDb()
  await until(isUpdatingTransactions).toBe(false)
  event.detail.complete()
}

if (import.meta.env.DEV) {
  watchEffect(() => {
    // eslint-disable-next-line no-console
    console.log('👛 Instant Pay Wallet', {
      Ready: isRemoteOk.value,
      Valid: isHtlcActive.value,
      Balance: remoteBalance.value,
    })
  })
}

watch([referralCode, phoneNumberVerified], () => {
  // Remove number verification and reward notifications and re-add them later if necessary
  const verifyNumberNotification = {
    id: 'verify-phone-number',
    get title() { return i18n.t('Activate Cashback & Rewards') },
    get subtitle() { return i18n.t('Requires Phone Number') },
    action: () => initializeFlow(FlowName.VerifyPhone),
  }
  const claimRewardsNotification = {
    id: 'claim-rewards',
    get title() { return i18n.t('You have a reward to claim!') },
    action: () => initializeFlow(FlowName.VerifyPhone),
  }

  // Remove notification if user has just verified their phone number
  if (phoneNumberVerified.value) {
    removeLocalNotification(verifyNumberNotification.id, false)
    removeLocalNotification(claimRewardsNotification.id, false)
  }

  if (referralCode.value && phoneNumberVerified.value) {
    redeemReferral()
  }
  else if (!referralCode.value && !phoneNumberVerified.value) {
    addLocalNotification(verifyNumberNotification, true)
    scrollToFirstNotification()
  }
  else if (referralCode.value && !phoneNumberVerified.value) {
    addLocalNotification(claimRewardsNotification, true)
    scrollToFirstNotification()
  }
}, { immediate: true })

async function detectPaymentRequest() {
  try {
    const { type, value: pr } = await Clipboard.read()
    if (type === 'text/plain' && pr) {
      if (displayedPaymentRequests.value.includes(pr))
        return
      const { useStringParser } = await import('@/composables/useStringParser')
      const { isPaymentRequest, getPaymentRequestData } = useStringParser()
      if (isPaymentRequest(pr)) {
        // Invoice could be expired, so we don't want to show the notification if it's invalid
        const { error } = await getPaymentRequestData(pr)
        if (!error) {
          detectedPaymentRequest.value = pr
          displayedPaymentRequests.value.push(pr)
          await until(isPaymentDisabled).toBe(false)
          // Wait for the animation to start before vibrating
          // It feels weird if the vibration happens before the notification is even shown
          await sleep(100)
          Haptics.impact({ style: ImpactStyle.Light })
        }
      }
    }
  }
  catch (error) {
    logger.error('Error reading clipboard:', error)
  }
}

onMounted(async () => {
  if (!dbExists.value) {
    logger.log('No DB found, redirecting to setup')
    await router.replace('/setup')
    return
  }
  if (locked.value) {
    logger.log('DB locked, redirecting to pin')
    await router.replace('/pin')
    return
  }

  if (phoneNumberVerified.value) {
    updatePointsBalance()
    await updateStatus()
    updateTasks()
  }

  scrollToFirstNotification()
  useNotifications().init()
  useSync().syncWallets()
  detectPaymentRequest()
})

App.addListener('resume', detectPaymentRequest)
</script>

<template>
  <IonPage class="bg-[#F8F8F8]">
    <IonHeader class="ion-no-border">
      <BackupNotification v-if="isRecoveryWordsShown" />
      <IonToolbar class="px-2">
        <IonButtons slot="start">
          <IonButton @click="showModal(Modal.Menu, { isSmall: true })">
            <MenuIcon class="h-5 w-7 opacity-30" />
          </IonButton>
        </IonButtons>
        <IonButtons slot="end">
          <IonButton
            class="text-base normal-case"
            aria-label="Earn Points"
            style="--background: var(--colors-darkblue-6); --color: var(--colors-darkblue); --padding-top: 9px; --padding-bottom: 10px;"
            @click="phoneNumberVerified ? showModal(Modal.Points) : initializeFlow(FlowName.VerifyPhone)"
          >
            <CryptoCityLogo slot="start" class="w-5 h-5 mr-2" />
            {{ phoneNumberVerified ? (pointsBalance / 1e5).toLocaleString() : $t('Earn Points') }}
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding scroll-smooth">
      <IonRefresher slot="fixed" @ion-refresh="handleRefresh($event)">
        <IonRefresherContent />
      </IonRefresher>

      <TheHomeAmounts class="mt-[72px] mb-4" />

      <QuickButton show-chevron center @click="initializeFlow(FlowName.NimTopUp)">
        {{ $t('Top Up') }}
      </QuickButton>

      <!-- Transaction List -->
      <TheHomeTransactions class="mt-8" />

      <QuickButton v-if="transactions.length > 3" show-chevron center @click="initializeFlow(FlowName.ViewTransactions)">
        {{ $t('See all') }}
      </QuickButton>

      <!-- TODO: replace with an html grid -->
      <IonGrid class="flex flex-col mt-10 gap-y-2">
        <!-- Notification Horizontal Scroll -->
        <IonRow v-if="localNotifications.length" class="ml-[-21px] w-screen">
          <ul
            ref="notificationList"
            class="hide-scrollbar scroll-pl-[21px] w-full overflow-auto flex gap-x-3 gap-y-8 pb-4 snap-x snap-mandatory"
          >
            <li v-for="notification in localNotifications" :key="notification.id" class="shrink-0 snap-start first:pl-[21px] last:pr-[21px]">
              <NotificationCard @click="notification.action" @close="() => removeLocalNotification(notification.id)">
                {{ notification.title }}
                <template v-if="notification.subtitle" #subtitle>
                  {{ notification.subtitle }}
                </template>
              </NotificationCard>
            </li>
          </ul>
        </IonRow>

        <!-- Referral -->
        <IonRow v-if="isReferralCardShown && referralClaimsRemaining > 0" class="mb-8">
          <NotificationCard
            class="w-full"
            @click="phoneNumberVerified ? showModal(Modal.Referral) : initializeFlow(FlowName.VerifyPhone)"
            @close="isReferralCardShown = false"
          >
            <span class="text-lg text-pumpkin">
              {{ $tc('Invite a friend! | Invite a friend and get {amount} Point each! | Invite a friend and get {amount} Points each!', referralRewardAmount, { amount: referralRewardAmount.toLocaleString() }) }}
            </span>
          </NotificationCard>
        </IonRow>

        <!-- Map -->
        <IonRow class="mt-2">
          <p class="ml-1 text-lg font-semibold">
            {{ $t('Find places that accept crypto!') }}
          </p>
        </IonRow>
        <IonRow>
          <a class="w-full mt-2 bg-white rounded-lg h-80">
            <!-- eslint-disable-next-line vue/html-self-closing -- self closing iframe is invalid html which the i18n extractor can't parse -->
            <iframe class="w-full h-full" sandbox="allow-scripts allow-same-origin allow-popups" src="https://map.nimiq.com/?layout=compact"></iframe>
          </a>
        </IonRow>
        <IonRow class="ion-justify-content-center">
          <IonButton
            fill="clear" class="text-base normal-case"
            @click="Browser.open({ url: 'https://map.nimiq.com/', toolbarColor: '#fff' })"
          >
            {{ $t('Go to Crypto Map') }}
            <IonIcon slot="end" class="text-space/50" :icon="chevronForward" />
          </IonButton>
        </IonRow>
      </IonGrid>
    </IonContent>

    <Transition name="slide-left" style="--slide-left-distance: 100vw">
      <div
        v-if="detectedPaymentRequest && !isPaymentDisabled"
        ref="prNotificationRef"
        class="absolute left-0 w-full px-2 py-3"
        :class="{ 'transition-all': !isSwiping }"
        :style="{ bottom: `${footerHeight}px` }"
      >
        <PaymentRequestDetectedNotification :invoice="detectedPaymentRequest" @on-continue="detectedPaymentRequest = null" />
      </div>
    </Transition>

    <!-- Footer -->
    <IonFooter ref="footerRef">
      <IonToolbar>
        <Transition name="slide-fade">
          <div v-if="consensus === 'established' && remoteHeight > 0 && localHeight > 0 && !nodesAreSynced" class="flex items-center justify-center gap-2 p-2 bg-pumpkin/15">
            <InfoIcon class="stroke-[1.5] text-pumpkin/60 size-3 shrink-0" />
            <p class="font-medium text-center text-pumpkin">
              {{ $t('Nodes are not synced.\nRemote: {remoteHeight}, Local: {localHeight}', { remoteHeight, localHeight }) }}
            </p>
          </div>
          <div v-else-if="((remoteBalance > 0 || localBalance > 0) && !isHtlcActive && !isSyncingWallets) || isTransactionPending" class="flex items-center justify-center gap-2 p-2 bg-pumpkin/15">
            <InfoIcon class="stroke-[1.5] text-pumpkin/60 size-3 shrink-0" />
            <!-- <p class="font-medium text-center text-pumpkin">
              {{ $t('Processing funds… ') }}
            </p> -->
            <p class="font-medium text-center text-pumpkin">
              {{ $tc(
                'Processing funds… | Processing funds. Wait ~{blocks} second to pay. | Processing funds. Wait ~{blocks} seconds to pay.',
                blocksUntilNextMacroBlock,
                { blocks: blocksUntilNextMacroBlock },
              ) }}
            </p>
          </div>
        </Transition>
        <IonButton
          class="w-3/4 py-2 mx-auto text-base" expand="block"
          :disabled="isPaymentDisabled"
          @click="initializeFlow(FlowName.NimOrPointsPayment)"
        >
          {{ $t('Pay') }}
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
  box-shadow: 0px 0px 4.12454px 0px rgba(31, 35, 72, 0.03), 0px 0px 12.51868px 0px rgba(31, 35, 72, 0.05), 0px 0px 32.00036px 0px rgba(31, 35, 72, 0.06), 0px 0px 80px 0px rgba(31, 35, 72, 0.07);
}

ion-toolbar.ios {
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
}

.footer-md {
  box-shadow: none;
}
</style>
