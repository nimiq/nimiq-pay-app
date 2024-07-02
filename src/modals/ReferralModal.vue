<script setup lang="ts">
import { computedAsync } from '@vueuse/core'
import { IonButton } from '@ionic/vue'
import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import { computed } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { usePoints } from '@/stores/points'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { Crypto } from '@/stores/app'
import { useLogger } from '@/composables/useLogger'
import { toCoins } from '@/composables/usePrice'

const logger = useLogger('ReferralModal')

const { setToast } = useToast()
const { getReferralInfo } = usePoints()
const { formatCrypto } = useCurrencyFormatter()

const referralInfo = computedAsync(async () => {
  const { data, error } = await getReferralInfo()
  if (error) {
    logger.error('Error getting referral info:', error)
    return null
  }
  return data
})
const referralRewardAmount = computed(() => toCoins(referralInfo.value?.reward || 0, Crypto.NIM))
const canShare = computedAsync(async () => {
  return (await Share.canShare()).value
})

async function handleCopy() {
  await Clipboard.write({
    string: referralInfo.value?.id,
  })
  await setToast({ message: i18n.t('Copied to the clipboard!') })
}

function handleShare() {
  Share.share({
    // Title if sharing via email
    title: 'Nimiq Pay App',
    // Text to share via all the apps
    text: i18n.t(
      'Hey! Join me on Nimiq Pay app and earn Cryptocity Points to pay for your purchases using crypto! '
        + 'Use my code {code} to earn {amount} in Cryptocity Points at registration.',
      { code: referralInfo.value?.id, amount: formatCrypto(referralInfo?.value?.reward || 0, { currency: Crypto.NIM }) },
    ),
    url: 'https://nimpay.app',
    // Title for the share modal. Only on Android
    dialogTitle: 'Nimiq Pay App',
  })
}
</script>

<template>
  <ModalTemplate>
    <template #title>
      {{ $tc('Invite a friend! | Invite a friend and get {amount} Point each! | Invite a friend and get {amount} Points each!', referralRewardAmount, { amount: referralRewardAmount.toLocaleString() }) }}
    </template>
    <p class="text-space/60 self-start text-balance">
      {{ $t(
        'Help grow the crypto adoption movement. Invite a friend and you will both get {amount} Cryptocity Points.',
        { amount: referralRewardAmount.toLocaleString() },
      ) }}
    </p>
    <Transition name="slide-fade" mode="out-in">
      <p v-if="!referralInfo" class="text-4xl font-semibold">
        {{ $t('Loading…') }}
      </p>
      <p v-else class="flex flex-col text-3xl font-semibold">
        {{ referralInfo?.id }}
        <!-- TODO: replace 10 with data from API -->
        <span class="text-space/60 mt-2 text-sm">{{
          referralInfo?.claims_remaining < 10
            ? $t('Only {count} out of {total} remaining.', { count: referralInfo?.claims_remaining.toLocaleString(), total: 10 })
            : $t('{count} of {total} remaining.', { count: referralInfo?.claims_remaining.toLocaleString(), total: 10 })
        }}</span>
      </p>
    </Transition>
    <div class="w-full flex flex-col self-end">
      <IonButton v-if="canShare" expand="block" strong :disabled="!referralInfo" @click="handleShare">
        {{ $t('Invite a Friend') }}
      </IonButton>
      <IonButton fill="clear" class="text-base normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="handleCopy">
        {{ $t('Copy code') }}
      </IonButton>
    </div>
  </ModalTemplate>
</template>
