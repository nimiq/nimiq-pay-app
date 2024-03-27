<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { Browser } from '@capacitor/browser'
import { close } from 'ionicons/icons'
import { useModal } from '@/composables/useModal'

const { closeModal } = useModal()
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="() => closeModal()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <div class="flex flex-col items-center h-full max-h-[90vh] p-8 pt-0">
    <h1 class="text-2xl font-bold text-center">
      {{ $t('Disclaimer') }}
    </h1>
    <i18n-t class="mt-8 overflow-scroll text-space/60" tag="p" keypath="When you register for a Cryptocity Points account in Nimiq Pay, you consent to our data management practices as detailed in our {privacyPolicy}. We prioritize your right to privacy and control over your data, thus providing an option within the app to delete your Cryptocity Points account at any time. This action will permanently remove your personal information, such as your phone number, from our records. To deter fraud, a secure log of deleted accounts will be retained for a period of 12 months. Should you decide to re-enroll, previous activities or data will not be recoverable. Our commitment to your data security includes a straightforward, in-app process for account deletion, aligning with industry best practices to ensure user autonomy and data protection. For instructions on deleting your account or for further information, please refer to the account settings within the app.">
      <template #privacyPolicy>
        <a class="underline" @click="Browser.open({ url: 'https://www.nimpay.app/privacy-policy', toolbarColor: '#E9B213' })">{{ $t('Privacy Policy') }}</a>
      </template>
    </i18n-t>
  </div>
</template>
