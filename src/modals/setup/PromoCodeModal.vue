<script setup lang="ts">
import { inject, onMounted, ref, watch } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { BonusWallet } from '@/lib/bonus-wallet'
import { ModalType, useModal } from '@/composables/useModal'

const { showModal } = useModal()
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const codeField = ref()
const referralCode = ref('')

watch(referralCode, async (newValue) => {
  if (newValue.length === 8) {
    try {
      await bonusWallet.setPromoCode(referralCode.value)
      showModal(ModalType.NewPin)
    }
    catch (e: any) {
      codeField.value.setCustomValidity(e.message || e)
      codeField.value.reportValidity()
    }
  }
})

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
        class="w-full pin" autofocus="true"
        :value="referralCode" @input="referralCode = ($event.target as HTMLTextAreaElement).value"
      >
    </form>
  </ModalTemplate>
</template>
