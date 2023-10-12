<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonList, IonSearchbar, IonToolbar } from '@ionic/vue'
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
      <IonButtons slot="end">
        <IonButton @click.stop="() => closeModal()">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent>
    <h1 class="my-2 text-center">
      All transactions
    </h1>
    <div class="px-4">
      <input
        :value="query"
        type="text" placeholder="Search"
        class="w-full px-3 py-2 mx-auto mt-8 text-xl text-blue-500 border-0 rounded-lg outline-none bg-blue-100/60 placeholder:text-blue-400"
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
