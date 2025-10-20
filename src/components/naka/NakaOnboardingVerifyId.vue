<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { SumsubSdkStatus } from 'capacitor-sumsub-mobile-sdk'
import { storeToRefs } from 'pinia'
import NakaVerificationCheckIcon from '@/components/icons/naka-id-verification.vue'
import { useToast } from '@/composables/useToast'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits } from '@/lib/flows/steps.types'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { useKyc } from '@/stores/kyc'
import { useNaka } from '@/stores/naka'

const emit = defineEmits(stepEmits)

const { setupCard } = useNaka()
const { getUserStatus } = useIssuerRestApi()
const { initializeSdk, openKycFlow, checkKycInBackground } = useKyc()
const { sdkStatus, onKycApproved } = storeToRefs(useKyc())

async function register() {
  // TODO: Loading state

  // If user already has a VERIFIED identification, skip KYC and setup card directly
  const user = await getUserStatus()
  // TODO: Check if initialized and wait until verified before trying KYC again
  if (user.identifications.find(identification => identification.status === 'VERIFIED')) {
    await setupCard(user)
    return initializeFlow(FlowName.NakaCardIsReady, { height: 'h-max' })
  }

  try {
    await initializeSdk()
    if (sdkStatus.value !== SumsubSdkStatus.READY) {
      throw new Error('KYC SDK is not ready')
    }
    await openKycFlow()
  }
  catch (error) {
    useToast().setToast({
      type: 'error',
      message: (error as Error).message,
    })
  }
}

onKycApproved.value = async () => {
  const user = await getUserStatus()
  if (!user.identifications.find(identification => identification.status === 'VERIFIED')) {
    console.error('User does not have a VERIFIED identification')
    useToast().setToast({
      type: 'spinner',
      message: 'KYC verification in progress, we will notify you once it is completed.',
      duration: 10000,
    })
    checkKycInBackground()
    return emit('done')
  }

  sdkStatus.value = SumsubSdkStatus.APPROVED
  await setupCard(user)
  initializeFlow(FlowName.NakaCardIsReady, { height: 'h-max' })
}
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <div class="flex flex-1 items-center justify-center">
      <NakaVerificationCheckIcon class="translate-y-[-10%]" />
    </div>
    <p class="text-center mb-4 text-opacity-60">
      {{ $t('By proceeding, you are agreeing to NAKA\'s Terms & Conditions and Privacy Policy') }}
    </p>
    <IonButton size="small" class="self-stretch my-6 text-base font-bold mt-auto" @click="register">
      {{ $t('Verify ID') }}
    </IonButton>
  </div>
</template>
