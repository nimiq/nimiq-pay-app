<script setup lang="ts">
import type { UserStatusResponse } from '@/lib/issuer-schemas/rest.schema'
import NakaVerificationCheckIcon from '@/components/icons/naka-id-verification.vue'
import { useToast } from '@/composables/useToast'
import { stepEmits } from '@/lib/flows/steps.types'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { useKyc } from '@/stores/kyc'
import { nakaCardFromApi, useNaka } from '@/stores/naka'
import { IonButton } from '@ionic/vue'
import { SumsubSdkStatus } from 'capacitor-sumsub-mobile-sdk'
import { storeToRefs } from 'pinia'

const emit = defineEmits(stepEmits)

const { registerForNaka, getUserStatus } = useIssuerRestApi()
const { initializeSdk, openKycFlow } = useKyc()
const { sdkStatus, onKycApproved } = storeToRefs(useKyc())

async function setupCard(user: UserStatusResponse) {
  const registration = await registerForNaka() // Only passes when the user has a VERIFIED identification
  const { setRegistration, setCard } = useNaka()
  setRegistration({
    state: user.state,
    nakaIdentification: user.identifications.find(i => i.id === registration.identification),
    nakaCards: registration.cards.map(nakaCardFromApi),
  })

  if (registration.cards.length > 0)
    await setCard(nakaCardFromApi(registration.cards[0]))

  emit('done') // Triggers NakaCardIsReady modal
}

async function register() {
  // TODO: Loading state

  // If user already has a VERIFIED identification, skip KYC and setup card directly
  const user = await getUserStatus()
  if (user.identifications.find(identification => identification.status === 'VERIFIED'))
    return setupCard(user)

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
  if (!user.identifications.find(identification => identification.status === 'VERIFIED'))
    console.error('User does not have a VERIFIED identification')

  await setupCard(user)
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
