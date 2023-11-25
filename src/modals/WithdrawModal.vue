<script setup lang="ts">
import { IonButton, IonSpinner } from '@ionic/vue'
import { onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useModal } from '@/composables/useModal'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useRemoteSigner } from '@/stores/remote-signer'
import AmountInput from '@/components/AmountInput.vue'
import { useFiat } from '@/stores/fiat'

const { closeModal, showNotificationAlert } = useModal()
const { getPriceNow } = useFiat()
const { remoteBalance } = storeToRefs(useRemoteSigner())
const amount: Ref<number | undefined> = ref()
const address = ref('')
const isLoading = ref(false)
const currentPrice = ref(0)

async function withdraw() {
  if (!amount.value || !address.value || isLoading.value)
    return
  if (Nimiq.Policy.coinsToLunas(amount.value) > remoteBalance.value)
    showNotificationAlert('Not enough funds', true)
  // TODO: handle invalid address
  const withdrawAddress = Nimiq.Address.fromUserFriendlyAddress(address.value)
  try {
    isLoading.value = true
    // await instantPayWallet.preparePayment({ address: withdrawAddress, amount: Nimiq.Policy.coinsToLunas(amount.value), label: 'Withdrawal', message: 'NIM Pay App Withdraw' })
    // const payment = instantPayWallet.getPendingPayment()
    // // TODO: handle null payment
    // if (payment === null)
    //   return
    // await instantPayWallet.completePendingPayment(payment)
    isLoading.value = false
    // TODO: handle not successful
    showNotificationAlert('Withdrawal successful')
    closeModal()
  }
  catch (e) {
    isLoading.value = false
    console.error('Error Withdraw', e)
  }
}

onMounted(async () => {
  const { data, error } = await getPriceNow()
  if (error || !data) {
    console.error(error)
    return
  }
  currentPrice.value = data
})
</script>

<template>
  <ModalTemplate>
    <template #title>
      Withdraw
    </template>
    <div class="flex flex-col self-start gap-y-4">
      <AmountInput v-model="amount" />
      <p class="text-base font-semibold text-space/60">
        {{ (((amount || 0) / currentPrice / 100) || 0).toLocaleString() }} NIM
      </p>
    </div>
    <div class="" />
  </ModalTemplate>
</template>
