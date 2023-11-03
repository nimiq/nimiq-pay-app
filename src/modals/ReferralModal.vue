<script setup lang="ts">
import { inject } from 'vue'
import { computedAsync } from '@vueuse/core'
import { IonButton, toastController } from '@ionic/vue'
import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import { BonusWallet } from '@/lib/bonus-wallet'
import ModalTemplate from '@/components/ModalTemplate.vue'

const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const voucherCode = computedAsync(async () => {
  const code = await bonusWallet.getReferralVoucherInfo()
  return code
})
const canShare = computedAsync(async () => {
  return (await Share.canShare()).value
})

async function handleCopy() {
  await Clipboard.write({
    string: voucherCode.value.id,
  })
  const toast = await toastController.create({
    message: '✔️ Copied to the clipboard!',
    duration: 2000,
  })
  await toast.present()
}

function handleShare() {
  Share.share({
    // Title if sharing via email
    title: 'Nimiq Pay App',
    // Text to share via all the apps
    text: `Hey! Join me on Nimiq Pay App and earn CC Points to pay for your purchases! Use my code ${voucherCode.value.id} to earn ${voucherCode.value.reward} NIM in CC Points at registration.`,
    url: 'https://www.nimiq.com/',
    // Title for the share modal. Only on Android
    dialogTitle: 'Nimiq Pay App',
  })
}
</script>

<template>
  <ModalTemplate>
    <template #title>
      Invite a friend and get {{ voucherCode?.reward / 1e5 }} NIM each
    </template>
    <p class="self-start text-space/60">
      Crypto adoption needs you! Bring a friend and you both get {{ voucherCode?.reward / 1e5 }} NIM in CC Points.
    </p>
    <Transition name="slide-fade" mode="out-in">
      <p v-if="!voucherCode" class="text-4xl font-semibold">
        Loading...
      </p>
      <p v-else class="flex flex-col text-3xl font-semibold">
        {{ voucherCode?.id }}
        <!-- TODO: replace 10 with data from API -->
        <span class="mt-2 text-sm text-space/60">{{ voucherCode?.claims_remaining < 10 ? 'Only' : '' }} {{ voucherCode?.claims_remaining }} out of 10 remaining</span>
      </p>
    </Transition>
    <div class="flex flex-col self-end w-full">
      <IonButton v-if="canShare" expand="block" strong :disabled="!voucherCode" @click="handleShare">
        Invite a Friend
      </IonButton>
      <IonButton fill="clear" class="text-base normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="handleCopy">
        Copy code
      </IonButton>
    </div>
  </ModalTemplate>
</template>
