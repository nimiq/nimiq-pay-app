<script setup lang="ts">
import NakaVerificationCheckIcon from '@/components/icons/naka-id-verification.vue'
import { useToast } from '@/composables/useToast'
import { stepEmits } from '@/lib/flows/steps.types'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { useKyc } from '@/stores/kyc'
import { nakaCardFromApi, useNaka } from '@/stores/naka'
import { IonButton } from '@ionic/vue'
import { SumsubSdkStatus } from 'capacitor-sumsub-mobile-sdk'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'

const emit = defineEmits(stepEmits)

const { registerForNaka, getUserStatus, getNakaIdentificationToken, createFakeIdentification, getNakaCardPinChangeToken, changeNakaCardPin } = useIssuerRestApi()
const { initializeSdk, openKycFlow, waitForStatusApproved } = useKyc()
const { sdkStatus } = storeToRefs(useKyc())

async function register() {
  // TODO: Loading state
  try {
    await initializeSdk()
    if (sdkStatus.value !== SumsubSdkStatus.READY) {
      throw new Error('KYC SDK is not ready')
    }
    await openKycFlow()

    // TODO: move this out or create a listener to prevent doing this twice
    // await waitForStatusApproved()

    // await createFakeIdentification()

    const user = await getUserStatus()
    if (!user.identifications.find(identification => identification.status === 'VERIFIED'))
      throw new Error('User does not have a VERIFIED identification')

    console.log('User:', user)

    const registration = await registerForNaka() // Only passes when the user has a VERIFIED identification

    // Set card PIN
    const { publicKey, expiry: _expiry } = await getNakaCardPinChangeToken(registration.cards[0].id)
    const { JSEncrypt } = await import('jsencrypt/lib/index.js')
    const encrypter = new JSEncrypt()
    encrypter.setKey(publicKey)
    const cypher = encrypter.encrypt('4242') // TODO: Use user's app PIN
    if (!cypher)
      throw new Error('Failed to encrypt PIN')
    await changeNakaCardPin(registration.cards[0].id, publicKey, cypher)

    const { setRegistration, setCard } = useNaka()
    setRegistration({
      state: user.state,
      nakaIdentification: user.identifications.find(i => i.id === registration.identification),
      nakaCards: registration.cards.map(nakaCardFromApi),
    })

    await setCard(nakaCardFromApi(registration.cards[0]))

    emit('done') // Triggers NakaCardIsReady modal
  }
  catch (error) {
    useToast().setToast({
      type: 'error',
      message: (error as Error).message,
    })
  }
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
