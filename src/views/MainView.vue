<script setup lang="ts">
import { App } from '@capacitor/app'
import { Clipboard } from '@capacitor/clipboard'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { IonPage, IonRouterOutlet, IonTabs } from '@ionic/vue'
import { refDebounced, refThrottled, until, useSwipe } from '@vueuse/core'
import { SumsubSdkStatus } from 'capacitor-sumsub-mobile-sdk'
import { storeToRefs } from 'pinia'
import { computed, markRaw, onMounted, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
// TODO: lazy load
import AlertIcon from '@/components/icons/alert.vue'
import InfoIcon from '@/components/icons/info.vue'
import WorldIcon from '@/components/icons/WorldIcon.vue'
import PaymentRequestDetectedNotification from '@/components/PaymentRequestDetectedNotification.vue'
import StatusMessage from '@/components/StatusMessage.vue'
import TheHomeFooter from '@/components/TheHomeFooter.vue'
import { useLogger } from '@/composables/useLogger'
import { useNotifications } from '@/composables/useNotifications'
import { i18n } from '@/i18n/i18n-setup'
import { debounceDelay, debounceMaxWait } from '@/lib'
import { sleep } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useGeoIp } from '@/stores/geoip'
import { useKyc } from '@/stores/kyc'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNaka } from '@/stores/naka'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { usePoints } from '@/stores/points'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSync } from '@/stores/sync'

const logger = useLogger('HomeView')

const router = useRouter()

const { isRemoteOk, isHtlcActive, remoteBalance, hasHtlcExpired } = storeToRefs(useRemoteSigner())
const { phoneNumberVerified, displayedPaymentRequests } = storeToRefs(useApp())
const { locked, dbExists } = storeToRefs(useConn())
const { pointsBalance } = storeToRefs(usePoints())
const { updatePointsBalance, updateTasks, updateStatus: updatePointsStatus } = usePoints()
const { consensus } = storeToRefs(useNimiqNetwork())
const { isTransactionPending, htlcCanBeExtended, blocksUntilNextMacroBlock } = storeToRefs(useSync())
const { isProcessingRemote, isSyncingWallets, isConsensusNeeded, isScannerActive } = storeToRefs(useLocks())
const { localBalance } = storeToRefs(useLocalWallet())
const { updateUser: updateNakaUser, isCountryNakaSupported } = useNaka()
const { isNakaAvailable } = storeToRefs(useNaka())
const { sdkStatus: kycSdkStatus } = storeToRefs(useKyc())
const { checkKycInBackground } = useKyc()

const isFirstRender = ref(true)

const isPaymentDisabled = computed(() => (pointsBalance.value === 0 && (!(isRemoteOk.value && isHtlcActive.value) || remoteBalance.value === 0)) || isProcessingRemote.value || isTransactionPending.value || hasHtlcExpired.value || htlcCanBeExtended.value)

const isConsensusMessageShown = computed(() => consensus.value !== 'established' && (isConsensusNeeded.value || htlcCanBeExtended.value || hasHtlcExpired.value))
const isConsensusMessageShownDebounced = refThrottled(isConsensusMessageShown, debounceDelay)

const statusMessageText = ref('')
const statusMessageBgColor = ref('bg-[#F9EDE1]')
const statusMessageTextColor = ref('text-pumpkin')
const statusMessageIconColor = ref('text-pumpkin/60')
const statusMessageIcon = ref(markRaw(InfoIcon))
const isStatusMessageShown = ref(false)
watchEffect(async () => {
  if (isFirstRender.value)
    return

  if (!isRemoteOk.value) {
    // Give it some time to really check if the server is down or if it's just fetching the status
    await until(isRemoteOk).toBe(true, { timeout: 5000 })
    if (!isRemoteOk.value) {
      statusMessageText.value = i18n.t('Server not available')
      statusMessageBgColor.value = 'bg-[#F9EDE1]'
      statusMessageTextColor.value = 'text-pumpkin'
      statusMessageIconColor.value = 'text-pumpkin/60'
      statusMessageIcon.value = markRaw(AlertIcon)
      isStatusMessageShown.value = true
    }
  }
  else if (((remoteBalance.value > 0 || localBalance.value > 0) && !isHtlcActive.value && !isSyncingWallets.value) || isTransactionPending.value) {
    statusMessageText.value = i18n.tc(
      'Processing funds… | Processing funds. Wait ~{blocks} second to pay. | Processing funds. Wait ~{blocks} seconds to pay.',
      blocksUntilNextMacroBlock.value,
      { blocks: blocksUntilNextMacroBlock.value },
    )
    statusMessageBgColor.value = 'bg-[#F9EDE1]'
    statusMessageTextColor.value = 'text-pumpkin'
    statusMessageIconColor.value = 'text-pumpkin/60'
    statusMessageIcon.value = markRaw(InfoIcon)
    isStatusMessageShown.value = true
  }
  else {
    return isStatusMessageShown.value = false
  }
})

const statusMessageBgColorDebounced = refDebounced(statusMessageBgColor, debounceDelay, { maxWait: debounceMaxWait })
const statusMessageTextColorDebounced = refDebounced(statusMessageTextColor, debounceDelay, { maxWait: debounceMaxWait })
const statusMessageIconColorDebounced = refDebounced(statusMessageIconColor, debounceDelay, { maxWait: debounceMaxWait })
const statusMessageIconDebounced = refDebounced(statusMessageIcon, debounceDelay, { maxWait: debounceMaxWait })
const isStatusMessageShownDebounced = refThrottled(isStatusMessageShown, debounceDelay)

// Payment Request Notification
const prNotificationRef = ref<HTMLDivElement | null>(null)
const detectedPaymentRequest = ref<string | null>('')
const { lengthX, isSwiping } = useSwipe(prNotificationRef, {
  threshold: 10,
  onSwipe: () => {
    if (lengthX.value > 0) {
      const distance = Math.abs(lengthX.value)
      prNotificationRef.value!.style.marginLeft = `-${distance}px`
      prNotificationRef.value!.style.opacity = `${1.25 - distance / prNotificationRef.value!.clientWidth}`
    }
    else {
      prNotificationRef.value!.style.marginLeft = '0'
      prNotificationRef.value!.style.opacity = '1'
    }
  },
  onSwipeEnd() {
    if (lengthX.value > 0 && (Math.abs(lengthX.value) / prNotificationRef.value!.clientWidth) >= 0.5) {
      prNotificationRef.value!.style.marginLeft = '-100%'
      prNotificationRef.value!.style.opacity = '0'
      detectedPaymentRequest.value = null
    }
    else {
      prNotificationRef.value!.style.marginLeft = '0'
      prNotificationRef.value!.style.opacity = '1'
    }
  },
})

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

watch(consensus, (value) => {
  if (value === 'established')
    isConsensusNeeded.value = false
})

watch([hasHtlcExpired], ([expired]) => {
  if (expired)
    isConsensusNeeded.value = true
  // Reset after htlc recreated and consensus established
  else if (consensus.value === 'established')
    isConsensusNeeded.value = false
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
          // Wait for the animation to start before vibrating
          // It feels weird if the vibration happens before the notification is even shown
          await sleep(100)
          Haptics.impact({ style: ImpactStyle.Light })
          // If no consensus user might close the app before even opening the notification and wants to see it again
          await until(consensus).toBe('established')
          displayedPaymentRequests.value.push(pr)
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

  // Check if NAKA is available in this region
  // const { country } = await useGeoIp().locate(ip)
  // if (country)
  //   isNakaAvailable.value = isCountryNakaSupported(country)
  // Getting IP first to store it in cache
  const ip = await useGeoIp().getIp()
  const response = await useGeoIp().locate(ip)

  if ('country_code' in response)
    isNakaAvailable.value = isCountryNakaSupported(response.country_code)

  updateNakaUser() // Fire and forget
  await updatePointsStatus()
  if (phoneNumberVerified.value) {
    updatePointsBalance()
    updateTasks()
  }

  useNotifications().init()
  useSync().syncWallets()
  detectPaymentRequest()

  if (kycSdkStatus.value === SumsubSdkStatus.PENDING)
    checkKycInBackground()

  isFirstRender.value = false
})

App.addListener('resume', detectPaymentRequest)
</script>

<template>
  <IonPage>
    <IonTabs>
      <IonRouterOutlet v-show="!isScannerActive" />
      <!-- Floating notifications -->
      <div
        class="absolute left-0 w-full bottom-0"
      >
        <!-- Payment Request from Clipboard -->
        <Transition name="slide-left" style="--slide-left-distance: 100vw">
          <div
            v-if="detectedPaymentRequest"
            ref="prNotificationRef"
            class="w-full px-2 py-3"
            :class="{ 'transition-all': !isSwiping }"
          >
            <PaymentRequestDetectedNotification :invoice="detectedPaymentRequest" :disabled="isPaymentDisabled" @on-continue="detectedPaymentRequest = null" />
          </div>
        </Transition>

        <!-- Status -->
        <Transition name="slide-fade">
          <StatusMessage
            v-if="isStatusMessageShownDebounced"
            :message="statusMessageText"
            :text-color="statusMessageTextColorDebounced"
            :bg-color="statusMessageBgColorDebounced"
            :icon-color="statusMessageIconColorDebounced"
            :icon="statusMessageIconDebounced"
            class="w-full px-2 py-3"
          />
        </Transition>

        <!-- Consensus -->
        <Transition name="slide-fade">
          <div v-if="isConsensusMessageShownDebounced" class="flex justify-center items-center font-semibold gap-2 pt-3 bg-white">
            <!-- Using rem breaks the svg in iOS -->

            <WorldIcon class="size-[16px]" />
            <span class="text-space/50">
              {{ `${$t('Establishing consensus')}...` }}
            </span>
          </div>
        </Transition>
      </div>

      <TheHomeFooter :is-first-render="isFirstRender" :is-payment-disabled="isPaymentDisabled" />
    </IonTabs>
  </IonPage>
</template>
