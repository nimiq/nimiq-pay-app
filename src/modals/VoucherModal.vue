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
    text: `Hey! Join me on Nimiq Pay App and earn CC Points to pay for your purchases! Use my code ${voucherCode.value.id} to earn 5€ in CC Points at registration.`,
    url: 'https://www.nimiq.com/',
    // Title for the share modal. Only on Android
    dialogTitle: 'Nimiq Pay App',
  })
}
</script>

<template>
  <ModalTemplate>
    <template #title>
      Invite a friend and both earn 5€ in CC Points
    </template>
    <div class="self-start">
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing.</p>
      <br>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing. Lorem ipsum dolor sit amet, consectetur adipiscing.</p>
    </div>
    <Transition name="slide-fade" mode="out-in">
      <p v-if="!voucherCode" class="text-4xl font-semibold">
        Loading...
      </p>
      <p v-else class="text-4xl font-semibold">
        {{ voucherCode?.id }}
      </p>
    </Transition>
    <div class="self-end w-full">
      <IonButton fill="clear" class="mb-4 text-base" @click="handleCopy">
        Copy code
      </IonButton>
      <IonButton v-if="canShare" expand="block" strong :disabled="!voucherCode" @click="handleShare">
        Share Nimiq Pay App and code
      </IonButton>
    </div>
  </ModalTemplate>
</template>
