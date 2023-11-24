<script setup lang="ts">
import { computedAsync } from '@vueuse/core'
import { IonButton } from '@ionic/vue'
import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { usePoints } from '@/stores/points'
import { useModal } from '@/composables/useModal'

const { showNotificationAlert } = useModal()
const { getReferralInfo } = usePoints()
const referralCode = computedAsync(async () => {
  const { data: code, error } = await getReferralInfo()
  if (error) {
    console.error(error)
    return null
  }
  return code
})
const canShare = computedAsync(async () => {
  return (await Share.canShare()).value
})

async function handleCopy() {
  await Clipboard.write({
    string: referralCode.value?.id,
  })
  await showNotificationAlert('Copied to the clipboard!')
}

function handleShare() {
  Share.share({
    // Title if sharing via email
    title: 'NIM Pay App',
    // Text to share via all the apps
    text: `Hey! Join me on NIM Pay App and earn CryptoCity Points to pay for your purchases! Use my code ${referralCode.value?.id} to earn ${(referralCode.value?.reward || 0) / 1e5} NIM in CryptoCity Points at registration.`,
    url: 'https://nimpay.app',
    // Title for the share modal. Only on Android
    dialogTitle: 'NIM Pay App',
  })
}
</script>

<template>
  <ModalTemplate>
    <template #title>
      Invite a friend and get {{ (referralCode?.reward || 0) / 1e5 }} NIM each
    </template>
    <p class="self-start text-space/60">
      Crypto adoption needs you! Bring a friend and you both get {{ (referralCode?.reward || 0) / 1e5 }} NIM in CC Points.
    </p>
    <Transition name="slide-fade" mode="out-in">
      <p v-if="!referralCode" class="text-4xl font-semibold">
        Loading...
      </p>
      <p v-else class="flex flex-col text-3xl font-semibold">
        {{ referralCode?.id }}
        <!-- TODO: replace 10 with data from API -->
        <span class="mt-2 text-sm text-space/60">{{ referralCode?.claims_remaining < 10 ? 'Only' : '' }} {{ referralCode?.claims_remaining }} out of 10 remaining</span>
      </p>
    </Transition>
    <div class="flex flex-col self-end w-full">
      <IonButton v-if="canShare" expand="block" strong :disabled="!referralCode" @click="handleShare">
        Invite a Friend
      </IonButton>
      <IonButton fill="clear" class="text-base normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="handleCopy">
        Copy code
      </IonButton>
    </div>
  </ModalTemplate>
</template>
