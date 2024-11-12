<script setup lang="ts">
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { i18n } from '@/i18n/i18n-setup'
import { stepEmits } from '@/lib/flows/steps.types'
import { usePoints } from '@/stores/points'
import { IonButton } from '@ionic/vue'
import { ref, watch } from 'vue'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({ errorMsg: { type: String }, stepName: { type: String, required: false }, inputLength: { type: Number, default: 7 } })
defineEmits(stepEmits)

const { getReferralInfoById } = usePoints()
const codeField = ref()
const referralCode = ref('')
const rewardAmount = ref(0)
const errorMessage = ref('')

const { formatCrypto } = useCurrencyFormatter()

watch(referralCode, async (newValue) => {
  if (newValue.length === props.inputLength) {
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
    ref="codeField" type="text"
    :name="stepName"
    :maxlength="inputLength"
    class="w-3/4 min-w-16 mx-auto uppercase text-3xl text-center mt-[33%] p-1 mb-4" autofocus="true"
    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
    :value="referralCode" @input="referralCode = ($event.target as HTMLTextAreaElement).value.toUpperCase()"
  >
  <p v-if="errorMessage || errorMsg" class="text-center text-pumpkin">
    {{ errorMessage || errorMsg }}
  </p>
  <div v-if="rewardAmount" class="w-full">
    <p class="text-center">
      {{ $tc('You will receive {amount} Point | You will receive {amount} Points', rewardAmount / 1e5, { amount: formatCrypto(rewardAmount) }) }}
    </p>
  </div>
  <IonButton expand="block" class="w-full pb-6 mt-auto" :disabled="!rewardAmount" @click="$emit('done', referralCode)">
    {{ $t('Claim Promo Code') }}
  </IonButton>
</template>
