<script setup lang="ts">
import { ref, watch } from 'vue'
import { IonButton } from '@ionic/vue'
import { usePoints } from '@/stores/points'
import { stepEmits } from '@/lib/flows/steps.types'
import { i18n } from '@/i18n/i18n-setup'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

defineProps({ errorMsg: { type: String } })
defineEmits(stepEmits)

const { getReferralInfoById } = usePoints()
const codeField = ref()
const referralCode = ref('')
const rewardAmount = ref(0)
const errorMessage = ref('')

const { formatCrypto } = useCurrencyFormatter()

watch(referralCode, async (newValue) => {
  if (newValue.length === 7) {
    try {
      const { data, error } = await getReferralInfoById(referralCode.value)
      if (error || !data)
        throw new Error(error || i18n.t('Something went wrong checking the promo code'))

      const { reward, claims_remaining } = data

      if (claims_remaining === 0) {
        throw new Error(i18n.t('This promo code has been claimed too many times'))
      }
      else if (claims_remaining > 0) {
        codeField.value.blur()
        rewardAmount.value = reward
      }
    }
    catch (e: any) {
      codeField.value.setCustomValidity(e.message || e)
      codeField.value.reportValidity()
      errorMessage.value = e.message || e
    }
  }
  else {
    rewardAmount.value = 0
  }
})
</script>

<template>
  <input
    ref="codeField" type="text" minlength="6"
    maxlength="8" size="8"
    class="w-4/5 mx-auto uppercase text-3xl text-center mt-[33%] p-1 mb-4" autofocus="true"
    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
    :value="referralCode" @input="referralCode = ($event.target as HTMLTextAreaElement).value.toUpperCase()"
  >
  <p v-if="errorMessage || errorMsg" class="text-center text-pumpkin">
    {{ errorMessage || errorMsg }}
  </p>
  <div v-if="rewardAmount" class="w-full">
    <p class="text-center">
      {{ $t('You will receive {amount} Points', { amount: formatCrypto(rewardAmount).replace(' NIM', '') }) }}
    </p>
  </div>
  <IonButton expand="block" class="pb-6 mt-auto" :disabled="!rewardAmount" @click="$emit('done', referralCode)">
    {{ $t('Claim Promo Code') }}
  </IonButton>
</template>
