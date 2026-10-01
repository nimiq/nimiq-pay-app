<script setup lang="ts">
import type { Ref } from 'vue'
import { IonBackdrop, IonButton, IonButtons, IonContent, IonGrid, IonHeader, IonPage, IonRefresher, IonRefresherContent, IonRow, IonToolbar, modalController } from '@ionic/vue'
import { computedAsync, useElementVisibility, useEventListener, useResizeObserver } from '@vueuse/core'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import BackupNotification from '@/components/BackupNotification.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import MenuIcon from '@/components/icons/menu.vue'
import LiveChat from '@/components/LiveChat.vue'
import LiveChatBadge from '@/components/LiveChatBadge.vue'
// TODO: lazy load
import NotificationCard from '@/components/NotificationCard.vue'
import TheHomeAmounts from '@/components/TheHomeAmounts.vue'
import TheHomeTransactions from '@/components/TheHomeTransactions.vue'
import { useLogger } from '@/composables/useLogger'
import { isMiniAppActive } from '@/composables/useMiniAppHost'
import { Modal, useModal } from '@/composables/useModal'
import { useNotifications } from '@/composables/useNotifications'
import { usePolygonSync } from '@/composables/usePolygonSync'
import { toCoins } from '@/composables/usePrice'
import { i18n } from '@/i18n/i18n-setup'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { isMockEnabled } from '@/lib/mock-mode'
import { promiseWithTimeout, sleep } from '@/lib/utils'
import { Crypto, useApp } from '@/stores/app'
import { useFeatureFlags } from '@/stores/feature-flags'
import { useLiveChat } from '@/stores/livechat'
import { useLocks } from '@/stores/locks'
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
const { isUsdtMaintenanceActive } = storeToRefs(useFeatureFlags())
const { enabled: liveChatEnabled, shown: liveChatShown } = storeToRefs(useLiveChat())

const notificationList: Ref<HTMLUListElement | undefined> = ref()
const isReferralCardShown = ref(true)
// Hidden in mock mode without persisting hasDoneBackup (which would suppress a real user's reminder).
const isRecoveryWordsShown = computed(() => !hasDoneBackup.value && !isMockEnabled)

// `isHomeVisible` combines three signals because IntersectionObserver alone misses
// Ionic modals (geometric intersection, not occlusion) and the native InAppBrowser
// webview (separate from the Vue tree).
const homeRoot = ref<HTMLElement | null>(null)
// The chat badge sits outside IonHeader so it can stay above the chat backdrop (Ionic header/toolbar
// have their own stacking contexts). Align it to the main toolbar, which banners above it push down.
// Offsets, not bounding rects: page transitions transform ion-page while mounting.
const headerRef = ref()
const toolbarRef = ref()
const chatBadgeRef = ref()
const chatBadgeTop = ref(0)
const chatBadgeBottom = ref(0)
useResizeObserver([headerRef, chatBadgeRef], () => {
  const toolbar: HTMLElement | undefined = toolbarRef.value?.$el
  const badge: HTMLElement | undefined = chatBadgeRef.value?.$el
  if (!toolbar || !badge)
    return
  // iOS pads the first header toolbar with the safe area; center within the content below it
  const paddingTop = Number.parseFloat(getComputedStyle(toolbar).paddingTop) || 0
  chatBadgeTop.value = toolbar.offsetTop + paddingTop + (toolbar.offsetHeight - paddingTop - badge.offsetHeight) / 2
  chatBadgeBottom.value = chatBadgeTop.value + badge.offsetHeight
})
const homeElementVisible = useElementVisibility(homeRoot)
const openModalCount = ref(0)
useEventListener(document, 'ionModalDidPresent', () => {
  openModalCount.value++
})
useEventListener(document, 'ionModalDidDismiss', () => {
  openModalCount.value = Math.max(0, openModalCount.value - 1)
})
const { isHomeVisible } = storeToRefs(useLocks())
watchEffect(() => {
  const next = homeElementVisible.value && openModalCount.value === 0 && !isMiniAppActive.value
  if (isHomeVisible.value !== next)
    isHomeVisible.value = next
})
onBeforeUnmount(() => {
  isHomeVisible.value = false
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

function openPointsFromHomeHeader() {
  if (isCampaignActive.value) {
    if (phoneNumberVerified.value) {
      showModal(Modal.Points, {
        analytics: {
          featureName: 'points',
          source: 'home_header',
        },
      })
    }
    else {
      initializeFlow(FlowName.VerifyPhone, { analyticsSource: 'home_rewards_cta' })
    }
    return
  }

  initializeFlow(FlowName.ComingSoon, {
    initialState: { comingSoon: i18n.t('Cryptocity Points are coming soon. Stay tuned!') },
  })
}

function openTopUp() {
  initializeFlow(FlowName.NimTopUp, { analyticsSource: 'home_primary_cta' })
}

function openWithdraw() {
  initializeFlow(FlowName.NimWithdraw, { analyticsSource: 'home_primary_cta' })
}

function openReferralFromHomeCard() {
  if (phoneNumberVerified.value) {
    showModal(Modal.Referral, {
      analytics: {
        featureName: 'referral',
        source: 'home_referral_card',
      },
    })
    return
  }

  initializeFlow(FlowName.VerifyPhone, { analyticsSource: 'home_referral_card' })
}

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

const REFRESH_SPINNER_TIMEOUT = 5_000 // hide wheel even if sync still running (APP-159)

async function handleRefresh(event: CustomEvent) {
  logger.log('Manual refresh triggered')
  // Detached so the spinner can be capped while sync finishes. The `.catch` keeps this promise
  // from rejecting (the timeout below may leave it pending) — it ONLY handles real sync failures.
  // The trailing refreshFromDb repaints the list with freshly-written txs once sync finishes,
  // including the case where it outlived the spinner timeout.
  const syncWork = (async () => {
    await Promise.all([
      sleep(2000),
      updatePointsBalance(),
      updatePointsStatus(),
      useSync().updateBalances(),
      useSync().updateTransactionHistory(),
      usePolygonSync().triggerNow(),
    ])
    await useSync().verifyRemoteSignersDb()
    await useTransactions().refreshFromDb()
  })().catch(err => logger.error('Refresh sync work failed', err))

  // Cap the wheel: if sync outlives the timeout it keeps running in the background and the
  // refreshFromDb inside syncWork repaints the list when it completes. This catch only ever
  // fires on timeout (syncWork never rejects), so the message is accurate.
  await promiseWithTimeout(syncWork, REFRESH_SPINNER_TIMEOUT)
    .catch(() => logger.warn('Refresh still syncing after timeout, dismissing spinner (APP-159)'))
  await useTransactions().refreshFromDb()
  event.detail.complete()
}

watch([referralCode, phoneNumberVerified, isCampaignActive], () => {
  // Remove number verification and reward notifications and re-add them later if necessary
  const verifyNumberNotification = {
    id: 'verify-phone-number',
    get title() { return i18n.t('Activate Cashback & Rewards') },
    get subtitle() { return i18n.t('Requires Phone Number') },
    action: () => initializeFlow(FlowName.VerifyPhone, { analyticsSource: 'home_notification' }),
  }
  const claimRewardsNotification = {
    id: 'claim-rewards',
    get title() { return i18n.t('You have a reward to claim!') },
    action: () => initializeFlow(FlowName.VerifyPhone, { analyticsSource: 'home_notification' }),
  }

  // Remove notification if user has just verified their phone number
  if (phoneNumberVerified.value) {
    removeLocalNotification(verifyNumberNotification.id, false)
    removeLocalNotification(claimRewardsNotification.id, false)
  }

  if (referralCode.value && phoneNumberVerified.value)
    redeemReferral()
  else if (!referralCode.value && !phoneNumberVerified.value && isCampaignActive.value)
    addLocalNotification(verifyNumberNotification, true)
  else if (referralCode.value && !phoneNumberVerified.value)
    addLocalNotification(claimRewardsNotification, true)
}, { immediate: true })

watch(() => localNotifications.value.length, (newValue, oldValue) => {
  if (newValue > oldValue)
    scrollToFirstNotification()
})

// Skip re-presenting while one is already shown — showModal() dismisses the
// current top before re-presenting, which could kill an unrelated overlay.
let isLongTimeNoSeeOpen = false
watch([hasHtlcExpired, isRemoteOk, isUpdatingTransactions], async ([expired, remoteOk, updatingDb]) => {
  if (!(expired && remoteOk && !updatingDb) || isLongTimeNoSeeOpen)
    return
  isLongTimeNoSeeOpen = true
  await showModal(Modal.LongTimeNoSee, { isSmall: true, canDismiss: false })
  const top = await modalController.getTop()
  top?.onDidDismiss().then(() => {
    isLongTimeNoSeeOpen = false
  })
}, { immediate: true })

onMounted(() => {
  scrollToFirstNotification()
  useLiveChat().initFromBackground()
})
</script>

<template>
  <IonPage ref="homeRoot" class="bg-[var(--colors-gray)]">
    <IonHeader ref="headerRef" class="ion-no-border">
      <BackupNotification v-if="isRecoveryWordsShown" />
      <IonToolbar ref="toolbarRef" class="px-2">
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
            @click="openPointsFromHomeHeader"
          >
            <CryptoCityLogo slot="start" class="w-5 h-5" />

            <span v-if="phoneNumberVerified" class="ml-2">
              {{ (pointsBalance / 1e5).toLocaleString() }}
            </span>
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
          <button aria-label="Top Up" class="px-6 py-2 text-base font-bold rounded-full bg-space/[0.06] text-space" @click="openTopUp">
            {{ $t('Top Up') }}
          </button>
          <button aria-label="Withdraw" class="px-6 py-2 text-base font-bold rounded-full bg-space/[0.06] text-space disabled:opacity-50" :disabled="!isNimiqAsset && isUsdtMaintenanceActive" @click="openWithdraw">
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
              @click="openReferralFromHomeCard"
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
    <LiveChatBadge v-if="liveChatEnabled" ref="chatBadgeRef" class="absolute left-[72px] z-20" :style="{ top: `${chatBadgeTop}px` }" />
    <LiveChat :style="{ '--top-margin': `${chatBadgeBottom}px` }" />
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
