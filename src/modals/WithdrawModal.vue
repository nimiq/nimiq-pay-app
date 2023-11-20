<script setup lang="ts">
import { IonButton, IonSpinner } from '@ionic/vue'
import { inject, ref } from 'vue'
import type { Ref } from 'vue'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { useModal } from '@/composables/useModal'
import ModalTemplate from '@/components/ModalTemplate.vue'

const { closeModal, showNotificationAlert } = useModal()
const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const amount: Ref<number | undefined> = ref()
const address = ref('')
const isLoading = ref(false)

async function withdraw() {
  if (!amount.value || !address.value || isLoading.value)
    return
  if (Nimiq.Policy.coinsToLunas(amount.value) > instantPayWallet.balanceRaw.value)
    showNotificationAlert('Not enough funds', true)
  // TODO: handle invalid address
  const withdrawAddress = Nimiq.Address.fromUserFriendlyAddress(address.value)
  try {
    isLoading.value = true
    await instantPayWallet.preparePayment({ address: withdrawAddress, amount: Nimiq.Policy.coinsToLunas(amount.value), label: 'Withdrawal', message: 'Nimiq Pay App Withdraw' })
    const payment = instantPayWallet.getPendingPayment()
    // TODO: handle null payment
    if (payment === null)
      return
    await instantPayWallet.completePendingPayment(payment)
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
</script>

<template>
  <ModalTemplate>
    <template #title>
      Withdraw
    </template>
    <div class="grid items-center h-full grid-rows-3">
      <div class="relative text-4xl rounded-md">
        <input v-model="amount" type="number" class="text-center" placeholder="0.00">
        <span class="absolute inset-y-0 flex items-center right-2">
          NIM
        </span>
      </div>
      <div class="text-3xl">
        <input
          :value="address" type="text" class="uppercase !px-4" placeholder="NQ..."
          @input="address = ($event.target as HTMLTextAreaElement).value.toUpperCase()"
        >
      </div>
      <div class="self-end w-full">
        <div class="flex justify-between mb-8 gap-x-5">
          <button @click="amount = 250">
            250 NIM
          </button>
          <button @click="amount = 500">
            500 NIM
          </button>
          <button @click="amount = 1000">
            1000 NIM
          </button>
          <button @click="amount = instantPayWallet.balance.value">
            All
          </button>
        </div>
        <IonButton expand="block" :disabled="!amount || !address" @click="withdraw">
          <IonSpinner v-if="isLoading" name="dots" style="--color: white" />
          <span v-else>
            Confirm
          </span>
        </IonButton>
      </div>
    </div>
  </ModalTemplate>
</template>

<style scoped>
input {
  @apply w-full border-0 py-1.5 pl-4 pr-20 ring-1 outline-none ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-400;
}

button {
  @apply px-2 py-2 rounded-full bg-space-space-200 text-space/60 font-bold w-1/4 min-w-[64px];
}
</style>
