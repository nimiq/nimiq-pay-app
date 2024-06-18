<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFooter, IonGrid, IonHeader, IonIcon, IonPage, IonRefresher, IonRefresherContent, IonRow, IonToolbar } from '@ionic/vue'
import { chevronForward } from 'ionicons/icons'
import { type Ref, computed, onMounted, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { Browser } from '@capacitor/browser'
import { storeToRefs } from 'pinia'
import { computedAsync } from '@vueuse/core'
import InfoIcon from '@/components/icons/info.vue'
import { Modal, useModal } from '@/composables/useModal'
import TransactionItem from '@/components/TransactionItem.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import MenuIcon from '@/components/icons/menu.vue'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Crypto, useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { usePoints } from '@/stores/points'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { i18n } from '@/i18n/i18n-setup'
import TheHomeAmounts from '@/components/TheHomeAmounts.vue'
import QuickButton from '@/components/QuickButton.vue'
import { useLogger } from '@/composables/useLogger'
import { useNotifications } from '@/composables/useNotifications'

// TODO: lazy load
import NotificationCard from '@/components/NotificationCard.vue'
import BackupNotification from '@/components/BackupNotification.vue'
import { useTransactions } from '@/stores/transactions'
import { useSync } from '@/composables/useSync'
import { FlowName } from '@/lib/flows/steps.types'
import { initializeFlow } from '@/lib/flows'
import { useLocalWallet } from '@/stores/local-wallet'
import { toCoins } from '@/composables/usePrice'

const logger = useLogger('HomeView')

const router = useRouter()
const { showModal } = useModal()

const { localBalance } = storeToRefs(useLocalWallet())
const { isRemoteOk, isHtlcActive, remoteBalance, blocksUntilHtlcActive, remoteHeight } = storeToRefs(useRemoteSigner())
const { phoneNumberVerified, referralCode, hasDoneBackup } = storeToRefs(useApp())
const { locked, dbExists } = storeToRefs(useConn())
const { pointsBalance } = storeToRefs(usePoints())
const { updatePointsBalance, updateTasks, updateStatus, redeemReferral, getReferralInfo } = usePoints()
const { transactions } = storeToRefs(useTransactions())
const { consensus, height: localHeight } = storeToRefs(useNimiqNetwork())
const { addLocalNotification, localNotifications, removeLocalNotification } = useNotifications()
const { nodesAreSynced } = useSync()

const notificationList: Ref<HTMLUListElement | undefined> = ref()
const isReferralCardShown = ref(true)
const isRecoveryWordsShown = computed(() => !hasDoneBackup.value && remoteBalance.value > 0)

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
    get title() { return i18n.t('Verify your phone number') },
    get subtitle() { return i18n.t('Get cashback and earn rewards') },
    action: () => initializeFlow(FlowName.VerifyPhone),
  }
  const claimRewardsNotification = {
    id: 'claim-rewards',
    get title() { return i18n.t('You have a reward to claim!') },
    action: () => initializeFlow(FlowName.VerifyPhone),
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
  await useSync().syncWallets()
})
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
      <ol v-if="transactions.length" class="mt-8">
        <li v-for="tx in transactions.slice(0, 3)" :key="tx.hash" :data-hash="tx.hash">
          <TransactionItem :tx="tx" @click="initializeFlow(FlowName.ViewTransactionDetail, { transactionList: tx })" />
        </li>
      </ol>

      <QuickButton v-if="transactions.length > 3" show-chevron center @click="initializeFlow(FlowName.ViewTransactions)">
        {{ $t('See all') }}
      </QuickButton>

      <!-- TODO: replace with an html grid -->
      <IonGrid class="flex flex-col mt-10 gap-y-2">
        <!-- Notification Horizontal Scroll -->
        <IonRow v-if="localNotifications.length" class="w-screen ml-[-21px]">
          <ul
            ref="notificationList"
            class="flex w-full gap-x-3 gap-y-8 pb-4 scroll-pl-[21px] snap-mandatory snap-x overflow-auto hide-scrollbar"
          >
            <li v-for="notification in localNotifications" :key="notification.id" class="snap-start shrink-0 first:pl-[21px] last:pr-[21px]">
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

    <!-- Footer -->
    <IonFooter>
      <IonToolbar>
        <Transition name="slide-fade">
          <div v-if="consensus === 'established' && !nodesAreSynced" class="flex items-center justify-center gap-2 p-2 bg-pumpkin/15">
            <InfoIcon class="size-3 stroke-[1.5] shrink-0 text-pumpkin/60" />
            <p class="font-medium text-center text-pumpkin">
              {{ $t('Nodes are not synced.\nRemote: {remoteHeight}, Local: {localHeight}', { remoteHeight, localHeight }) }}
            </p>
          </div>
          <div v-else-if="(remoteBalance > 0 || localBalance > 0) && !isHtlcActive" class="flex items-center justify-center gap-2 p-2 bg-pumpkin/15">
            <InfoIcon class="size-3 stroke-[1.5] shrink-0 text-pumpkin/60" />
            <p class="font-medium text-center text-pumpkin">
              {{ $tc(
                'Processing funds… | Processing funds. Wait ~{blocks} minute to pay. | Processing funds. Wait ~{blocks} minutes to pay.',
                blocksUntilHtlcActive,
                { blocks: blocksUntilHtlcActive },
              ) }}
            </p>
          </div>
        </Transition>
        <IonButton
          class="w-3/4 py-2 mx-auto text-base" expand="block"
          :disabled="pointsBalance === 0 && (!(isRemoteOk && isHtlcActive) || consensus !== 'established' || remoteBalance === 0) || !nodesAreSynced"
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

.footer-md {
  box-shadow: none;
}
</style>
