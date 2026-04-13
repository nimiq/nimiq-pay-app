<script setup lang="ts">
import type { Ref } from 'vue'
import { IonBackdrop, IonButton, IonButtons, IonContent, IonGrid, IonHeader, IonPage, IonRefresher, IonRefresherContent, IonRow, IonToolbar } from '@ionic/vue'
import { computedAsync, until } from '@vueuse/core'
import { SumsubSdkStatus } from 'capacitor-sumsub-mobile-sdk'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import BackupNotification from '@/components/BackupNotification.vue'
import MapIcon from '@/components/icons/crypto-map.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import MenuIcon from '@/components/icons/menu.vue'
import LiveChat from '@/components/LiveChat.vue'
import LiveChatBadge from '@/components/LiveChatBadge.vue'
// TODO: lazy load
import NotificationCard from '@/components/NotificationCard.vue'
import TheHomeAmounts from '@/components/TheHomeAmounts.vue'
import TheHomeTransactions from '@/components/TheHomeTransactions.vue'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { useNotifications } from '@/composables/useNotifications'
import { usePolygonSync } from '@/composables/usePolygonSync'
import { toCoins } from '@/composables/usePrice'
import { i18n } from '@/i18n/i18n-setup'
import { isNakaEnabled } from '@/lib'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { sleep } from '@/lib/utils'
import { Crypto, useApp } from '@/stores/app'
import { useFeatureFlags } from '@/stores/feature-flags'
import { useKyc } from '@/stores/kyc'
import { useLiveChat } from '@/stores/livechat'
import { useLocks } from '@/stores/locks'
import { useNaka } from '@/stores/naka'
import { usePoints } from '@/stores/points'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSync } from '@/stores/sync'
import { useTransactions } from '@/stores/transactions'

const logger = useLogger('HomeView')

const { showModal } = useModal()

const { isRemoteOk, hasHtlcExpired } = storeToRefs(useRemoteSigner())
const { phoneNumberVerified, referralCode, hasDoneBackup, showAnimations, isNimiqAsset } = storeToRefs(useApp())
const { pointsBalance, isCampaignActive } = storeToRefs(usePoints())
const { updatePointsBalance, updateStatus: updatePointsStatus, redeemReferral, getReferralInfo } = usePoints()
const { addLocalNotification, localNotifications, removeLocalNotification } = useNotifications()
const { isUpdatingTransactions } = storeToRefs(useLocks())
const { hasCard: hasNakaCard } = storeToRefs(useNaka())
const { isNakaAvailable } = storeToRefs(useFeatureFlags())
const { sdkStatus: kycSdkStatus } = storeToRefs(useKyc())
const { enabled: liveChatEnabled, shown: liveChatShown } = storeToRefs(useLiveChat())

const notificationList: Ref<HTMLUListElement | undefined> = ref()
const isReferralCardShown = ref(true)
const isRecoveryWordsShown = computed(() => !hasDoneBackup.value)

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
  window.requestAnimationFrame(() => {
    if (localNotifications.value.length && notificationList.value) {
      notificationList.value?.scrollTo({
        left: notificationList.value.scrollWidth * -1,
        behavior: 'smooth',
      })
    }
  })
}

async function handleRefresh(event: CustomEvent) {
  logger.log('Manual refresh triggered')
  await Promise.all([
    sleep(2000),
    updatePointsBalance(),
    updatePointsStatus(),
    useSync().updateBalances(),
    useSync().updateTransactionHistory(),
    usePolygonSync().triggerNow(),
  ])
  await useSync().verifyRemoteSignersDb()
  await until(isUpdatingTransactions).toBe(false)
  await useTransactions().refreshFromDb()
  event.detail.complete()
}

watch([referralCode, phoneNumberVerified, isCampaignActive, hasNakaCard, kycSdkStatus, isNakaAvailable, isNimiqAsset], () => {
  const nakaCardActivationNotification = {
    id: 'activate-naka-card',
    get title() { return i18n.t('Tap to pay with NAKA!') },
    get subtitle() { return i18n.t('Activate NAKA for contactless payments') },
    action: () => initializeFlow(FlowName.NakaOnboarding),
  }

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

  // Remove notification if user already has a Naka card
  if (hasNakaCard.value || !isNimiqAsset.value) {
    removeLocalNotification(nakaCardActivationNotification.id, false)
  }

  if (referralCode.value && phoneNumberVerified.value)
    redeemReferral()
  else if (!referralCode.value && !phoneNumberVerified.value && isCampaignActive.value)
    addLocalNotification(verifyNumberNotification, true)
  else if (referralCode.value && !phoneNumberVerified.value)
    addLocalNotification(claimRewardsNotification, true)
  if (!hasNakaCard.value && isNimiqAsset.value && kycSdkStatus.value !== SumsubSdkStatus.APPROVED && isNakaEnabled && isNakaAvailable.value)
    addLocalNotification(nakaCardActivationNotification, true)
}, { immediate: true })

watch(() => localNotifications.value.length, (newValue, oldValue) => {
  if (newValue > oldValue)
    scrollToFirstNotification()
})

watch([hasHtlcExpired, isRemoteOk, isUpdatingTransactions], ([expired, remoteOk, updatingDb]) => {
  if (expired && remoteOk && !updatingDb)
    showModal(Modal.LongTimeNoSee, { isSmall: true, canDismiss: false })
}, { immediate: true })

onMounted(() => {
  scrollToFirstNotification()
  useLiveChat().initFromBackground()
})
</script>

<template>
  <IonPage class="bg-[var(--colors-gray)]">
    <IonHeader class="ion-no-border">
      <BackupNotification v-if="isRecoveryWordsShown" />
      <IonToolbar class="px-2">
        <IonButtons slot="start">
          <IonButton aria-label="Open menu" @click="showModal(Modal.Menu, { isSmall: true })">
            <MenuIcon class="h-5 w-7 opacity-30" />
          </IonButton>
        </IonButtons>
        <IonButtons slot="end">
          <IonButton
            class="text-base normal-case"
            aria-label="Earn Points"
            style="--background: var(--colors-darkblue-6); --color: var(--colors-darkblue); --padding-top: 9px; --padding-bottom: 10px;"
            @click="isCampaignActive ? (phoneNumberVerified ? showModal(Modal.Points) : initializeFlow(FlowName.VerifyPhone)) : initializeFlow(FlowName.ComingSoon, { initialState: { comingSoon: $t('Cryptocity Points are coming soon. Stay tuned!') } })"
          >
            <CryptoCityLogo slot="start" class="w-5 h-5" />

            <span v-if="phoneNumberVerified" class="ml-2">
              {{ (pointsBalance / 1e5).toLocaleString() }}
            </span>
          </IonButton>

          <IonButton aria-label="Crypto Map" fill="clear" @click="showModal(Modal.Map, { showHandle: true })">
            <MapIcon class="h-6 opacity-40" />
          </IonButton>
        </IonButtons>
      </IonToolbar>

      <motion.div
        class="pt-16 pb-4 px-4"
        :initial="{ opacity: 0, y: 50 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: showAnimations ? 0.4 : 0, ease: 'easeOut' }"
      >
        <TheHomeAmounts class="mb-4" />

        <div class="flex justify-center gap-x-3 mt-2">
          <button aria-label="Top Up" class="px-6 py-2 text-base font-bold rounded-full bg-space/[0.06] text-space" @click="initializeFlow(FlowName.NimTopUp)">
            {{ $t('Top Up') }}
          </button>
          <button aria-label="Withdraw" class="px-6 py-2 text-base font-bold rounded-full bg-space/[0.06] text-space" @click="initializeFlow(FlowName.NimWithdraw)">
            {{ $t('Withdraw') }}
          </button>
        </div>
      </motion.div>
    </IonHeader>
    <IonContent class="ion-padding scroll-smooth">
      <IonRefresher slot="fixed" @ion-refresh="handleRefresh($event)">
        <IonRefresherContent />
      </IonRefresher>

      <!-- Notification Horizontal Scroll -->
      <!-- my-8 to have some space even when no notifications -->
      <IonGrid class="flex flex-col gap-y-2 pb-0 my-8" :class="{ 'mt-6': localNotifications.length > 0 || isReferralCardShown && referralClaimsRemaining > 0 }">
        <IonRow v-if="localNotifications.length" class="ml-[-21px] w-screen">
          <motion.ul
            ref="notificationList"
            :initial="{ opacity: 0, y: 50 }"
            :while-in-view="{ opacity: 1, y: 0 }"
            :transition="{ duration: showAnimations ? 0.4 : 0, ease: 'easeOut' }"
            class="hide-scrollbar scroll-pl-[21px] w-full overflow-auto flex gap-x-3 gap-y-8 pb-4 snap-x snap-mandatory"
          >
            <motion.li
              v-for="(notification, index) in localNotifications"
              :id="notification.id"
              :key="notification.id"
              :initial="{ opacity: 0, y: 20 }"
              :while-in-view="{ opacity: 1, y: 0 }"
              :transition="{ duration: showAnimations ? 0.3 : 0, delay: showAnimations ? index * 0.05 : 0 }"
              class="shrink-0 snap-start first:pl-[21px] last:pr-[21px]"
            >
              <NotificationCard @click="notification.action" @close="() => removeLocalNotification(notification.id)">
                {{ notification.title }}
                <template v-if="notification.subtitle" #subtitle>
                  {{ notification.subtitle }}
                </template>
              </NotificationCard>
            </motion.li>
          </motion.ul>
        </IonRow>

        <!-- Referral -->
        <IonRow v-if="isReferralCardShown && referralClaimsRemaining > 0" class="mb-8">
          <motion.div
            :initial="{ opacity: 0, y: 50, scale: 0.9, rotate: -2 }"
            :while-in-view="{ opacity: 1, y: 0, scale: 1, rotate: 0 }"
            :transition="{ duration: showAnimations ? 0.4 : 0, ease: 'backOut' }"
            class="w-full"
          >
            <NotificationCard
              class="w-full"
              @click="phoneNumberVerified ? showModal(Modal.Referral) : initializeFlow(FlowName.VerifyPhone)"
              @close="isReferralCardShown = false"
            >
              <span class="text-lg text-pumpkin">
                {{ $tc('Invite a friend! | Invite a friend and get {amount} Point each! | Invite a friend and get {amount} Points each!', referralRewardAmount, { amount: referralRewardAmount.toLocaleString() }) }}
              </span>
            </NotificationCard>
          </motion.div>
        </IonRow>
      </IonGrid>

      <TheHomeTransactions class="mt-10" />
    </IonContent>

    <!-- Live Chat -->
    <IonBackdrop v-if="liveChatEnabled && liveChatShown" class="bg-black opacity-[0.32] z-20" @ion-backdrop-tap="liveChatShown = false" />
    <LiveChatBadge v-if="liveChatEnabled" class="absolute top-[10px] left-[72px] z-20" />
    <LiveChat />
  </IonPage>
</template>

<style scoped>
ion-header {
  background: var(--colors-gray);

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 24px;
    background: linear-gradient(to bottom, var(--colors-gray), transparent);
    transform: translateY(100%);
    pointer-events: none;
    z-index: 1;
  }
}

ion-content {
  --background: var(--colors-gray);
}
</style>
