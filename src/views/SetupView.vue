<script setup lang="ts">
import { IonButton, IonContent, IonHeader, IonPage, IonToolbar } from '@ionic/vue'
import { FlowName } from '@/lib/flows/steps.types'
import { initializeFlow } from '@/lib/flows'
</script>

<template>
  <IonPage>
    <IonHeader class="ion-no-border">
      <IonToolbar />
    </IonHeader>
    <IonContent :fullscreen="true">
      <div class="flex flex-col items-center justify-center h-full text-center">
        <div class="mt-auto">
          <svg width="169" height="56" viewBox="0 0 169 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M62.1102 25.375L49.0238 2.625C48.0816 0.9975 46.3542 0 44.4872 0H18.3144C16.4474 0 14.72 0.9975 13.7865 2.625L0.700122 25.375C-0.233374 27.0025 -0.233374 28.9975 0.700122 30.625L13.7865 53.375C14.72 55.0025 16.4474 56 18.3144 56H44.4872C46.3542 56 48.0816 55.0025 49.0151 53.375L62.1015 30.625C63.0437 28.9975 63.0437 27.0025 62.1102 25.375Z" fill="url(#paint0_radial_482_37128)" />
            <path d="M86.6616 44.4838V11.2788H101.404C105.046 11.2788 107.825 12.158 109.74 13.9164C111.656 15.6747 112.613 18.0925 112.613 21.1696C112.613 24.2154 111.656 26.6332 109.74 28.4229C107.825 30.2127 105.046 31.1076 101.404 31.1076H92.7374V44.4838H86.6616ZM92.7374 26.3035H100.697C102.707 26.3035 104.214 25.8639 105.219 24.9847C106.223 24.0741 106.726 22.8024 106.726 21.1696C106.726 19.5369 106.223 18.2809 105.219 17.4017C104.214 16.4911 102.707 16.0358 100.697 16.0358H92.7374V26.3035Z" fill="#1F2348" />
            <path d="M125.183 44.9548C123.11 44.9548 121.289 44.4681 119.719 43.4947C118.149 42.4899 116.925 41.0612 116.046 39.2086C115.166 37.3561 114.727 35.1424 114.727 32.5677C114.727 29.9929 115.166 27.7949 116.046 25.9738C116.925 24.1212 118.149 22.7082 119.719 21.7348C121.289 20.7301 123.11 20.2277 125.183 20.2277C127.192 20.2277 128.951 20.7301 130.458 21.7348C131.996 22.7082 133.017 24.027 133.519 25.6912H133.001L133.519 20.6987H139.171C139.077 21.672 138.983 22.6611 138.889 23.6659C138.826 24.6707 138.794 25.6598 138.794 26.6332V44.4838H132.954L132.907 39.5854H133.472C132.97 41.2182 131.949 42.5213 130.411 43.4947C128.872 44.4681 127.13 44.9548 125.183 44.9548ZM126.831 40.4332C128.684 40.4332 130.175 39.7895 131.306 38.5022C132.436 37.1834 133.001 35.2052 133.001 32.5677C133.001 29.9301 132.436 27.9676 131.306 26.6803C130.175 25.3929 128.684 24.7492 126.831 24.7492C124.979 24.7492 123.487 25.3929 122.357 26.6803C121.226 27.9676 120.661 29.9301 120.661 32.5677C120.661 35.2052 121.211 37.1834 122.31 38.5022C123.44 39.7895 124.947 40.4332 126.831 40.4332Z" fill="#1F2348" />
            <path d="M145.895 55.1753L144.529 50.5125C146.005 50.1985 147.245 49.8374 148.25 49.4292C149.254 49.021 150.087 48.4872 150.746 47.8278C151.405 47.1684 151.955 46.3206 152.394 45.2844L153.572 42.5056L153.431 44.8135L143.069 20.6987H149.333L156.775 39.2557H155.409L162.898 20.6987H168.832L157.999 45.8025C157.277 47.4981 156.492 48.8954 155.644 49.9944C154.796 51.1247 153.886 52.0196 152.912 52.679C151.939 53.3698 150.872 53.9036 149.71 54.2804C148.548 54.6572 147.276 54.9555 145.895 55.1753Z" fill="#1F2348" />
            <defs>
              <radialGradient id="paint0_radial_482_37128" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(47.2499 55.2707) scale(62.8308 63.0162)">
                <stop stop-color="#EC991C" />
                <stop offset="1" stop-color="#E9B213" />
              </radialGradient>
            </defs>
          </svg>
        </div>
        <div class="w-10/12 mx-auto mt-auto">
          <IonButton class="w-full text-base" expand="block" @click="initializeFlow(FlowName.Setup)">{{
            $t('Get Started')
          }}</IonButton>
          <div class="flex justify-around">
            <IonButton class="text-base tracking-normal normal-case" fill="clear" @click="initializeFlow(FlowName.SetupWithPromoCode)">{{
              $t('I have a promo code')
            }}</IonButton>
            <IonButton class="text-base tracking-normal normal-case" fill="clear" @click="initializeFlow(FlowName.Login)">{{
              $t('Login')
            }}</IonButton>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
ion-toolbar {
    --background: none;
}

ion-icon.icon-extra-large {
    font-size: 96px;
    padding: 32px;
}
</style>
