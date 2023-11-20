<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonList, IonSearchbar, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { RecycleScroller } from 'vue-virtual-scroller'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { useModal } from '@/composables/useModal'
import TransactionCard from '@/components/TransactionCard.vue'

const { closeModal } = useModal()
const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet

const query = ref('')
const transactions = computed(() => {
  return instantPayWallet.transactions.value.filter((tx: Transaction) => {
    if (query.value === '')
      return true
    if (tx.title.toLowerCase().includes(query.value))
      return true
    if (tx.datetime.toLowerCase().includes(query.value))
      return true
    if (tx.fiatAmount?.toString().toLowerCase().includes(query.value))
      return true
    if ((tx.amount / 1e5).toString().toLowerCase().includes(query.value))
      return true
    return false
  })
})
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <slot name="leftButton" />
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.stop="closeModal()" />
      </IonButtons>
      <IonButtons slot="end">
        <IonButton @click.stop="closeModal()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent>
    <p class="px-8 mt-2 text-sm font-bold uppercase text-space/60">
      All transactions
    </p>
    <div class="px-4 mt-6">
      <input
        :value="query"
        type="text" placeholder="Search"
        class="w-full px-4 py-2 border-[1.5px] rounded-[8rem] outline-none border-space-space-300 focus:border-sky-sky-500 text-sky placeholder:text-space/60"
        @input="query = ($event.target as HTMLTextAreaElement).value.toLowerCase()"
      >
    </div>
    <IonList lines="none" class="px-4">
      <RecycleScroller class="h-full" :items="transactions" :item-size="70">
        <template #default="{ item }">
          <TransactionCard :tx="item" />
        </template>
      </RecycleScroller>
    </IonList>
  </IonContent>
</template>
