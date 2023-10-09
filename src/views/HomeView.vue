<script setup lang="ts">
import { IonButton, IonButtons, IonCol, IonContent, IonFab, IonFabButton, IonFooter, IonGrid, IonHeader, IonIcon, IonMenuButton, IonPage, IonRow, IonToolbar } from '@ionic/vue'
import { chevronForwardOutline, trendingUpOutline } from 'ionicons/icons'
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
import type { Ref } from 'vue'
import { inject, onBeforeUnmount, onDeactivated, onMounted, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { BonusWallet } from '@/lib/bonus-wallet'
import { StorageManager } from '@/lib/storage-manager'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { FiatHandler } from '@/lib/fiat-handler'
import { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import { NimiqWallet } from '@/lib/nimiq-wallet'
import { ModalType, useModal } from '@/composables/useModal'
import NotificationCard from '@/components/NotificationCard.vue'
import TaskCard from '@/components/TaskCard.vue'
import NotificationAlert from '@/components/NotificationAlert.vue'

const router = useRouter()
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const storageManager = inject(StorageManager.KEY) as StorageManager
const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const fiatHandler = inject(FiatHandler.KEY) as FiatHandler
const nimiqNetworkClient = inject(NimiqNetworkClient.KEY) as NimiqNetworkClient
const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet
const { showModal, showNotificationAlert } = useModal()
const isPromoCodeEntered = bonusWallet.isPromoCodeEntered()
const isPhoneRegistered = bonusWallet.isRegistered()
const bonusModal: Ref<{ $el: HTMLIonModalElement } | undefined> = ref()
const notificationList: Ref<HTMLUListElement | undefined> = ref()
// TODO: get this from API
const bonusAmount = 5
// TODO: get this from somewhere
const notificationArray = ref([
  {
    title: 'Notification Card 1',
    action: () => console.log('Notification Card 1 clicked'),
  },
  {
    title: 'Notification Card 2',
    action: () => console.log('Notification Card 2 clicked'),
  },
  {
    title: 'Notification Card 3',
    action: () => console.log('Notification Card 3 clicked'),
  },
  {
    title: 'Notification Card 4',
    action: () => console.log('Notification Card 4 clicked'),
  },
  {
    title: 'Notification Card 5',
    action: () => console.log('Notification Card 5 clicked'),
  },
])

function removeNotification(index: number) {
  notificationArray.value.splice(index, 1)
}

async function startScan() {
  await BarcodeScanner.checkPermission({ force: true })
  await BarcodeScanner.hideBackground()
  while (true) {
    const result = await BarcodeScanner.startScan()
    if (!result.hasContent)
      continue
    if (!result.content.startsWith('nimiq:'))
      continue
    try {
      const url = new URL(result.content)
      const address = Nimiq.Address.fromString(url.pathname)
      const searchParams = new URLSearchParams(url.search)
      const amountString = searchParams.get('amount')
      if (amountString == null)
        continue
      const amount = Math.round(Number.parseFloat(amountString) * 100000)
      await instantPayWallet.sendTransaction(address, amount)
      break
    }
    catch (e) {
      console.error(e)
    }
  }
  await stopScan()
}

async function stopScan() {
  await BarcodeScanner.showBackground()
  await BarcodeScanner.stopScan()
}

function scrollToFirstNotification() {
  // Scroll to first notification
  notificationList.value?.scrollTo({
    left: notificationList.value.scrollWidth * -1,
    behavior: 'smooth',
  })
}

watchEffect(async () => {
  const verifyNumberTitle = 'Verify your phone number to get cashback and earn rewards'
  const claimRewardTitle = 'You have 5€ reward to claim!'
  // Remove custom notifications and add them later if necessary
  notificationArray.value = notificationArray.value.filter((notification) => {
    return notification.title !== verifyNumberTitle && notification.title !== claimRewardTitle
  })

  console.log('isPhoneRegistered', isPhoneRegistered.value)
  console.log('isPromoCodeEntered', isPromoCodeEntered.value)
  if (isPromoCodeEntered.value && isPhoneRegistered.value) {
    setTimeout(() => {
      showNotificationAlert(bonusModal)
    }, 750)
  }
  else if (!isPromoCodeEntered.value && !isPhoneRegistered.value) {
    notificationArray.value.unshift({
      title: verifyNumberTitle,
      action: () => showModal(ModalType.NewPhone),
    })
    scrollToFirstNotification()
  }
  else if (isPromoCodeEntered.value && !isPhoneRegistered.value) {
    notificationArray.value.unshift({
      title: claimRewardTitle,
      action: () => showModal(ModalType.NewPhone),
    })
    scrollToFirstNotification()
  }
})

onBeforeUnmount(stopScan)
onDeactivated(stopScan)

onMounted(async () => {
  if (!storageManager.isUnlocked())
    router.replace('/pin')

  scrollToFirstNotification()

  console.log('isDev', isDev)
})
</script>

<template>
  <IonPage>
    <IonHeader class="px-2 ion-no-border">
      <IonToolbar>
        <IonButtons slot="start">
          <IonMenuButton :auto-hide="false" @click="() => console.log('Menu clicked')" />
        </IonButtons>
        <IonButtons slot="end">
          <IonButton fill="solid" class="font-bold" style="--padding-start: 0.75rem; --padding-bottom: 0.4rem; --padding-top: 0.4rem">
            Earn BonusNIM
            <IonIcon slot="end" :icon="chevronForwardOutline" />
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding scroll-smooth">
      <IonGrid class="flex flex-col gap-y-2">
        <!-- Balance -->
        <IonRow class="flex flex-col items-center justify-center h-[40vh]">
          <h1 class="mb-3 text-5xl font-normal">
            {{ (Math.floor(instantPayWallet.balance.value * fiatHandler.price.value * 100) / 100).toFixed(2) }} €
          </h1>
          <p class="text-lg text-blue-300">
            {{ Math.floor(instantPayWallet.balance.value).toFixed(2) }} NIM
            <IonIcon slot="start" :icon="trendingUpOutline" class="ml-3" />
            <span class="ml-1 font-semibold">{{ Math.round(fiatHandler.priceChange.value * 1000) / 10 }}%</span>
          </p>
          <IonButton fill="clear" class="text-xl font-medium">
            Top Up <IonIcon slot="end" :icon="chevronForwardOutline" />
          </IonButton>
        </IonRow>
        <!-- Horizontal Scroll -->
        <IonRow>
          <ul ref="notificationList" class="flex items-end min-w-[100vw] overflow-x-auto hide-scrollbar snap-x snap-mandatory gap-x-3 last:pr-96 scroll-pl-4">
            <li v-for="(notification, index) in notificationArray" :key="notification.title">
              <NotificationCard @click="notification.action" @close="() => removeNotification(index)">
                {{ notification.title }}
              </NotificationCard>
            </li>
          </ul>
        </IonRow>

        <!-- Earn NIM -->
        <IonRow>
          <p class="mt-4 ml-1 text-lg font-semibold">
            Earn NIM
          </p>
        </IonRow>
        <!-- Referral -->
        <IonRow>
          <TaskCard highlight large>
            Invite a friend and earn up to 2500€ both!
          </TaskCard>
        </IonRow>
        <!-- Tasks -->
        <!-- TODO: get them from array -->
        <IonRow>
          <IonCol>
            <TaskCard>
              Earn BonusNIM with Cash Back
            </TaskCard>
          </IonCol>
          <IonCol>
            <TaskCard :reward="2000" :progress="2" :total="4">
              Task Name
            </TaskCard>
          </IonCol>
        </IonRow>
        <IonRow>
          <IonCol>
            <TaskCard :reward="1000" :progress="0" :total="4">
              Task Name
            </TaskCard>
          </IonCol>
          <IonCol>
            <TaskCard :reward="500">
              Task Name
            </TaskCard>
          </IonCol>
        </IonRow>
      </IonGrid>

      <!-- Map -->
      <IonRow>
        <p class="mt-8 ml-1 text-lg font-semibold">
          Find places that accept crypto
        </p>
      </IonRow>
      <IonRow>
        <div class="flex items-center justify-center w-full mt-2 bg-blue-200 rounded-lg h-72">
          <span class="text-blue-50">Map</span>
        </div>
      </IonRow>
      <IonRow class="ion-justify-content-center">
        <IonButton fill="clear">
          Go to map
          <IonIcon slot="end" :icon="chevronForwardOutline" />
        </IonButton>
      </IonRow>

      <!-- BonusNIM Modal -->
      <NotificationAlert ref="bonusModal">
        <template #title>
          You got BonusNIM!
        </template>
        <template #body>
          {{ bonusAmount }}€
        </template>
        <template #extra>
          {{ (bonusAmount / fiatHandler.price.value).toFixed(2) }} NIM
        </template>
      </NotificationAlert>
    </IonContent>
    <IonFooter>
      <IonToolbar>
        <IonGrid>
          <IonRow class="ion-justify-content-center">
            <IonCol size="8">
              <IonButton
                style="--box-shadow: none;"
                expand="block" :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || instantPayWallet.balance.value === 0"
                @click="startScan()"
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
ion-col {
  --ion-grid-column-padding: 0;
}

ion-row {
  column-gap: 0.5rem;
}
/* Disable scrollbar */
ion-content {
  --offset-bottom: auto!important;
  --overflow: hidden;
  overflow: auto;
  &::-webkit-scrollbar {
    display: none;
  }
}

ion-footer > ion-toolbar {
  --border-color: rgb(59 130 246);
  --border-width: 1px 0 0 0;
  --border-style: solid;
}

.footer-md {
    box-shadow: none !important;
}
</style>
