<script setup lang="ts">
import {
  IonAlert,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCol,
  IonContent,
  IonFooter,
  IonGrid,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuButton,
  IonModal,
  IonNote,
  IonPage,
  IonRouterOutlet,
  IonRow,
  IonText,
  IonTitle,
  IonToolbar,
  alertController,
} from '@ionic/vue'
import { inject, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { basket, chevronBack, chevronForward, close, menu, trendingUp } from 'ionicons/icons'
import { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import { NimiqWallet } from '@/lib/nimiq-wallet'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { FiatHandler } from '@/lib/fiat-handler'
import { StorageManager } from '@/lib/storage-manager'

const nimiqNetworkClient = inject(NimiqNetworkClient.KEY) as NimiqNetworkClient
const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet
const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const fiatHandler = inject(FiatHandler.KEY) as FiatHandler
const storageManager = inject(StorageManager.KEY) as StorageManager

const router = useRouter()
const menuModal = ref()
const modal = ref()
const backVisible = ref()

router.afterEach((to) => {
  backVisible.value = false
  if (to.path === '/app')
    closeModal()
})

function openModal(target: string) {
  router.push(target)
  modal.value.$el.present()
}

function backModal() {
  if (router.currentRoute.value.path !== '/app/pay')
    router.back()
}

function closeModal() {
  modal.value.$el.dismiss()
}
</script>

<template>
  <IonPage>
    <IonContent id="main-content" :fullscreen="true">
      <IonToolbar style="--background: transparent">
        <IonButtons slot="start">
          <IonButton id="main-menu-button">
            <IonIcon :icon="menu" />
          </IonButton>
        </IonButtons>
        <IonButtons slot="end">
          <IonButton fill="solid">
            BonusNIM
            <IonIcon slot="end" :icon="chevronForward" />
          </IonButton>
        </IonButtons>
      </IonToolbar>
      <div class="balance-view">
        <div class="line-fiat">
          <span class="balance-fiat">{{ Math.floor(instantPayWallet.balance.value * fiatHandler.price.value * 100)
            / 100 }} €</span>
        </div>
        <div class="line-nim">
          <span class="balance-nim">{{ Math.floor(instantPayWallet.balance.value) }} NIM</span>
          <span class="price-change"><IonIcon slot="start" :icon="trendingUp" /> {{
            Math.round(fiatHandler.priceChange.value * 1000) / 10 }}%</span>
        </div>
        <div class="line-topup">
          <IonButton fill="clear">
            Top up
            <IonIcon slot="end" :icon="chevronForward" />
          </IonButton>
        </div>
      </div>
      <IonList v-if="instantPayWallet.transactions.value.length > 0" lines="none">
        <IonItem v-for="tx in instantPayWallet.transactions.value.slice(0, 3)" :button="true" :detail="false">
          <IonIcon slot="start" :icon="basket" size="large" />
          <IonLabel>
            <IonText>{{ tx.title }}</IonText><br>
            <IonNote color="medium">
              {{ tx.datetime }}
            </IonNote>
          </IonLabel>
          <div slot="end">
            <div>{{ tx.fiatAmount }}</div>
            <IonNote color="medium">
              {{ tx.amount / 100000 }} NIM
            </IonNote>
          </div>
        </IonItem>
        <div style="text-align: center">
          <IonButton fill="clear">
            Show all
          </IonButton>
        </div>
      </IonList>
      <div style="height: 100rem" />
      <IonCard>
        <IonCardHeader>
          <IonCardTitle>Nimiq Client</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <p>Initialized: <strong>{{ nimiqNetworkClient.initialized }}</strong></p>
          <p>Consensus state: <strong>{{ nimiqNetworkClient.consensusState.value }}</strong></p>
          <p>
            Head <strong>{{ nimiqNetworkClient.head.value?.height }}</strong>:
            <code>{{ nimiqNetworkClient.head.value?.hash()?.toHex() }}</code>
          </p>
        </IonCardContent>
      </IonCard>
      <IonCard>
        <IonCardHeader>
          <IonCardTitle>Base wallet</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <p>Address: <code>{{ nimiqWallet.address.value?.toUserFriendlyAddress() }}</code></p>
          <p>Balance: <code>{{ nimiqWallet.balance.value }} NIM</code></p>
          <IonButton
            :disabled="nimiqNetworkClient.consensusState.value != 'established' || nimiqWallet.balanceRaw.value == 0"
            @click="instantPayWallet.deposit(nimiqWallet.balanceRaw.value)"
          >
            Move
            to instant
          </IonButton>
        </IonCardContent>
      </IonCard>
      <IonCard>
        <IonCardHeader>
          <IonCardTitle>Instant wallet</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <p>Address: <code>{{ instantPayWallet.address.value?.toUserFriendlyAddress() }}</code></p>
          <p>Balance (if valid): <code>{{ instantPayWallet.balance.value }} NIM</code></p>
          <p>
            Valid: <strong>{{ instantPayWallet.valid.value }}</strong> (from <strong>{{
              instantPayWallet.validityStart.value }}</strong> to
            <strong>{{ instantPayWallet.validityEnd.value }}</strong>)
          </p>
          <p>Timeouted: <strong>{{ instantPayWallet.timeouted.value }}</strong></p>
          <IonButton
            :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || instantPayWallet.balance.value == 0"
            @click="openModal('/app/pay')"
          >
            Pay
          </IonButton>
          <IonButton
            :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value || instantPayWallet.timeouted.value) || instantPayWallet.balance.value == 0"
            @click="instantPayWallet.recover()"
          >
            Recover
          </IonButton>
          <IonButton
            :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value || instantPayWallet.timeouted.value) || instantPayWallet.balance.value == 0"
            @click="instantPayWallet.extend()"
          >
            Extend
          </IonButton>
        </IonCardContent>
      </IonCard>
      <IonModal
        ref="menuModal" trigger="main-menu-button" can-dismiss="true" :initial-breakpoint="1"
        :breakpoints="[0, 1]" handle="false" style="--height: auto"
      >
        <IonToolbar style="--background: transparent;">
          <IonButtons slot="end">
            <IonButton @click="menuModal.$el.dismiss()">
              <IonIcon :icon="close" />
            </IonButton>
          </IonButtons>
        </IonToolbar>
        <IonList lines="none">
          <IonItem button :detail="false">
            Top Up
          </IonItem>
          <IonItem button :detail="false">
            Withdraw
          </IonItem>
          <div class="menu-list-divider" />
          <IonItem button :detail="false">
            Activate Bluecode payments
          </IonItem>
          <IonItem button :detail="false">
            Activate Cashback & Rewards
          </IonItem>
          <div class="menu-list-divider" />
          <IonItem button :detail="false">
            Settings
          </IonItem>
          <IonItem button :detail="false">
            Back Up
          </IonItem>
          <IonItem button :detail="false">
            Log Out
          </IonItem>
        </IonList>
      </IonModal>
      <IonModal ref="modal" can-dismiss="true" handle="false" :initial-breakpoint="1" :breakpoints="[0, 1]">
        <IonToolbar>
          <IonButtons slot="start" :style="{ display: backVisible ? 'flex' : 'none' }">
            <IonButton @click="backModal">
              <IonIcon :icon="chevronBack" />
            </IonButton>
          </IonButtons>
          <IonButtons slot="end">
            <IonButton @click="closeModal">
              <IonIcon :icon="close" />
            </IonButton>
          </IonButtons>
        </IonToolbar>
        <IonContent class="ion-padding">
          <IonRouterOutlet />
        </IonContent>
      </IonModal>
    </IonContent>
    <IonFooter>
      <IonToolbar>
        <IonGrid>
          <IonRow class="ion-justify-content-center">
            <IonCol size="8">
              <IonButton
                expand="block" :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || instantPayWallet.balance.value == 0"
                @click="openModal('/app/pay')"
              >
                Pay
              </IonButton>
            </IonCol>
          </IonRow>
        </IonGrid>
      </IonToolbar>
    </IonFooter>
  </IonPage>
</template>

<style scoped>
.menu-list-divider {
    height: 1px;
    background-color: rgba(0,0,0,0.2);
    margin: 0.5rem 1rem;
}
.balance-view {
    padding: 4rem 1rem;
    text-align: center;
}

.line-fiat {
    font-size: 2.5em;
}

.line-nim {
    padding-top: 0.1rem;
}

.price-change {
    padding-left: 0.5rem;
}
</style>
