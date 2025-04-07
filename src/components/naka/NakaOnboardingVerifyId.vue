<script setup lang="ts">
import NakaVerificationCheckIcon from '@/components/icons/naka-id-verification.vue'
import { useToast } from '@/composables/useToast'
import { stepEmits } from '@/lib/flows/steps.types'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { nakaCardFromApi, useNaka } from '@/stores/naka'
import { IonButton } from '@ionic/vue'

const emit = defineEmits(stepEmits)

async function register() {
  // TODO: Loading state

  try {
    const { registerForNaka, getUserStatus, getNakaIdentificationToken, createFakeIdentification } = useIssuerRestApi()

    // Do KYC
    const _kycToken = await getNakaIdentificationToken()

    // TODO: Start KYC flow with the token
    await createFakeIdentification()

    const user = await getUserStatus()
    if (!user.identifications.find(identification => identification.status === 'VERIFIED'))
      throw new Error('User doesn not have a VERIFIED identification')

    const registration = await registerForNaka() // Only passes when the user has a VERIFIED identification

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
