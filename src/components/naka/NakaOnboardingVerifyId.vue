<script setup lang="ts">
import type { IonToggleCustomEvent, ToggleChangeEventDetail } from '@ionic/core'
import { Browser } from '@capacitor/browser'
import { IonButton, IonToggle } from '@ionic/vue'
import { SumsubSdkStatus } from 'capacitor-sumsub-mobile-sdk'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'
import NakaVerificationCheckIcon from '@/components/icons/naka-id-verification.vue'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits } from '@/lib/flows/steps.types'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { useKyc } from '@/stores/kyc'
import { useNaka } from '@/stores/naka'

const emit = defineEmits(stepEmits)
const logger = useLogger('NakaOnboardingVerifyId')

const { setupCard, updateUser } = useNaka()
const { getUserStatus } = useIssuerRestApi()
const { initializeSdk, openKycFlow, checkKycInBackground } = useKyc()
const { sdkStatus, onKycApproved, onKycDismissed } = storeToRefs(useKyc())

const isLoading = ref(false)
const isTCAccepted = ref(false)

function handleTCToggle(event: IonToggleCustomEvent<ToggleChangeEventDetail>) {
  isTCAccepted.value = Boolean(event.detail.checked)
}

async function register() {
  if (isLoading.value)
    return
  isLoading.value = true

  try {
    // If user already has a VERIFIED identification, skip KYC and setup card directly
    const user = await getUserStatus()
    // TODO: Check if initialized and wait until verified before trying KYC again
    if (user.identifications.find(identification => identification.status === 'VERIFIED')) {
      await setupCard(user)
      return initializeFlow(FlowName.NakaCardIsReady, { height: 'h-max' })
    }

    await initializeSdk()
    if (sdkStatus.value !== SumsubSdkStatus.READY) {
      throw new Error('KYC SDK is not ready')
    }
    await openKycFlow()
  }
  catch (error) {
    isLoading.value = false
    logger.error('Error during KYC initialization or opening KYC flow:', error)
    useToast().setToast({
      type: 'error',
      message: (error as Error).message,
    })
  }
}

onKycApproved.value = async () => {
  try {
    const user = await getUserStatus()
    if (!user.identifications.find(identification => identification.status === 'VERIFIED')) {
      isLoading.value = false
      logger.error('User does not have a VERIFIED identification')
      useToast().setToast({
        type: 'spinner',
        message: i18n.t('KYC verification in progress, we will notify you once it is completed.'),
        duration: 10000,
      })
      checkKycInBackground()
      return emit('done')
    }

    sdkStatus.value = SumsubSdkStatus.APPROVED
    await setupCard(user)
    isLoading.value = false
    initializeFlow(FlowName.NakaCardIsReady, { height: 'h-max' })
  }
  catch (error) {
    isLoading.value = false
    logger.error('Error setting up NAKA Card after KYC approval:', error)
    useToast().setToast({
      type: 'error',
      message: i18n.t('There was an error setting up your NAKA Card. Please try again later.'),
    })
    emit('done')
  }
}

onKycDismissed.value = async () => {
  isLoading.value = false
  updateUser()
}
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <div class="flex flex-1 items-center justify-center">
      <NakaVerificationCheckIcon class="translate-y-[-10%]" />
    </div>
    <div class="mb-8 text-space/60 flex flex-row items-center gap-2">
      <i18n-t tag="span" keypath="I agree to NAKA Card's {terms}">
        <template #terms>
          <span class="underline text-primary font-bold whitespace-nowrap" @click="Browser.open({ url: 'https://rest.issuer.nimpay.app/public/Nimiq_NAKA_Card_TC.pdf', toolbarColor: '#0582CA' })">
            {{ $t('Terms & Conditions') }}
          </span>
        </template>
      </i18n-t>
      <IonToggle :checked="isTCAccepted" @ion-change="handleTCToggle" />
    </div>
    <IonButton size="small" class="self-stretch my-6 text-base font-bold mt-auto" :disabled="!isTCAccepted || isLoading" @click="register">
      <Transition
        mode="out-in"
        name="slide-fade"
      >
        <LoadingSpinner v-if="isLoading" class="w-4 h-4 m-auto text-white" />
        <span v-else>{{ $t('Verify ID') }}</span>
      </Transition>
    </IonButton>
  </div>
</template>
