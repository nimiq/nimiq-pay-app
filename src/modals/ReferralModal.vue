<script setup lang="ts">
import { computedAsync } from '@vueuse/core'
import { IonButton } from '@ionic/vue'
import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { usePoints } from '@/stores/points'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'

const { setToast } = useToast()
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
  await setToast({ message: i18n.t('Copied to the clipboard!') })
}

function handleShare() {
  Share.share({
    // Title if sharing via email
    title: 'NIM Pay App',
    // Text to share via all the apps
    text: i18n.t(
      'Hey! Join me on NIM Pay App and earn CryptoCity Points to pay for your purchases! '
        + 'Use my code {code} to earn {amount} NIM in CryptoCity Points at registration.',
      { code: referralCode.value?.id, amount: (referralCode.value?.reward || 0) / 1e5 }
    ),
    url: 'https://nimpay.app',
    // Title for the share modal. Only on Android
    dialogTitle: 'NIM Pay App',
  })
}
</script>

<template>
  <ModalTemplate>
    <template #title>{{
      $t('Invite a friend and get {amount} NIM each', { amount: (referralCode?.reward || 0) / 1e5 })
    }}</template>
    <p class="self-start text-space/60">{{
      $t(
        'Crypto adoption needs you! Bring a friend and you both get {amount} NIM in CC Points.',
        { amount: (referralCode?.reward || 0) / 1e5 },
      )
    }}</p>
    <Transition name="slide-fade" mode="out-in">
      <p v-if="!referralCode" class="text-4xl font-semibold">{{ $t('Loading...') }}</p>
      <p v-else class="flex flex-col text-3xl font-semibold">
        {{ referralCode?.id }}
        <!-- TODO: replace 10 with data from API -->
        <span class="mt-2 text-sm text-space/60">{{
          referralCode?.claims_remaining < 10
            ? $t('Only {count} out of {total} remaining.', { count: referralCode?.claims_remaining, total: 10 })
            : $t('{count} of {total} remaining.', { count: referralCode?.claims_remaining, total: 10 })
        }}</span>
      </p>
    </Transition>
    <div class="flex flex-col self-end w-full">
      <IonButton v-if="canShare" expand="block" strong :disabled="!referralCode" @click="handleShare">{{
        $t('Invite a Friend')
      }}</IonButton>
      <IonButton fill="clear" class="text-base normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="handleCopy">{{
        $t('Copy code')
      }}</IonButton>
    </div>
  </ModalTemplate>
</template>
