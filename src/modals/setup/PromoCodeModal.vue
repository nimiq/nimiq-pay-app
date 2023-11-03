<script setup lang="ts">
import { inject, onMounted, ref, watch } from 'vue'
import { IonButton } from '@ionic/vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { BonusWallet } from '@/lib/bonus-wallet'
import { ModalType, useModal } from '@/composables/useModal'

const { showModal } = useModal()
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const codeField = ref()
const referralCode = ref('')
const rewardAmount = ref(0)

watch(referralCode, async (newValue) => {
  if (newValue.length === 7) {
    try {
      const { claims_remaining, reward } = await bonusWallet.getReferralInfo(referralCode.value)
      if (claims_remaining === 0) { throw new Error('This promo code has been claimed too many times') }
      else if (claims_remaining > 0) {
        codeField.value.blur()
        rewardAmount.value = reward
      }
    }
    catch (e: any) {
      codeField.value.setCustomValidity(e.message || e)
      codeField.value.reportValidity()
    }
  }
  else {
    rewardAmount.value = 0
  }
})

function handleClaim() {
  try {
    bonusWallet.delayRedeemVoucher(referralCode.value)
    showModal(ModalType.NewPin)
  }
  catch (e: any) {
    codeField.value.setCustomValidity(e.message || e)
    codeField.value.reportValidity()
  }
}

onMounted(() => {
  setTimeout(() => {
    codeField.value.focus()
  }, 200)
})
</script>

<template>
  <ModalTemplate>
    <template #title>
      Enter your promo code
    </template>
    <template #subtitle>
      Enter your referral promo code
    </template>
    <form class="self-start mt-[30%]" @submit.prevent>
      <input
        ref="codeField" type="text" minlength="6"
        maxlength="8" size="8"
        class="w-full uppercase pin" autofocus="true"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        :value="referralCode" @input="referralCode = ($event.target as HTMLTextAreaElement).value.toUpperCase()"
      >
    </form>
    <div v-if="rewardAmount" class="self-end w-full">
      <p class="mb-4">
        You are going to get {{ rewardAmount / 1e5 }} NIM
      </p>
      <IonButton expand="block" @click="handleClaim">
        Claim Promo Code
      </IonButton>
    </div>
  </ModalTemplate>
</template>
