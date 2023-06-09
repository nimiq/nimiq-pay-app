<template>
    <ion-page ref="page">
        <ion-content :fullscreen="true" id="main-content" style="text-align: center;">
            <h2>Easy Pay!</h2>
            <p>Easy payments by scanning QR code</p>
            <p>Pay in many places</p>
            <p><ion-button style="width: 100%;" @click="openModal('/setup/choose-pin')">Get Started</ion-button></p>
            <p>
                <ion-button fill="clear" @click="openModal('/setup/promo-code')">I have a promo code</ion-button>
                <ion-button fill="clear" @click="openModal('/setup/login')" disabled="true">Login</ion-button>
            </p>
            <ion-modal ref="modal" can-dismiss="true" :initial-breakpoint="1" :breakpoints="[0, 1]"
                handle="false">
                <ion-toolbar>
                    <ion-buttons slot="start" :style="{ display: backVisible ? 'flex' : 'none' }">
                        <ion-button @click="backModal"><ion-icon :icon="chevronBackOutline"></ion-icon></ion-button>
                    </ion-buttons>
                    <ion-buttons slot="end">
                        <ion-button @click="closeModal"><ion-icon :icon="close"></ion-icon></ion-button>
                    </ion-buttons>
                </ion-toolbar>
                <ion-content class="ion-padding">
                    <ion-router-outlet></ion-router-outlet>
                </ion-content>
            </ion-modal>
        </ion-content>
    </ion-page>
</template>

<style>
ion-modal ion-toolbar {
    --border-color: transparent;
    --background: none;
}

ion-content p {
    padding-left: 2em;
    padding-right: 2em;
}

ion-icon.icon-extra-large {
    font-size: 96px;
    padding: 32px;
}
</style>
  
<script setup lang="ts">
import { IonPage, IonContent, IonButton, IonModal, IonHeader, IonToolbar, IonButtons, IonIcon, IonRouterOutlet } from '@ionic/vue';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { chevronBackOutline, close } from 'ionicons/icons'

const page = ref()
const modal = ref()
const backVisible = ref()
const router = useRouter()

const NO_BACK_PATHS = ['/setup/choose-pin', '/setup/promo-code', '/setup/login']

router.afterEach((to) => {
    backVisible.value = !NO_BACK_PATHS.includes(to.path)
    if (to.path == '/app') closeModal()
})

function openModal(target: string) {
    router.push(target)
    modal.value.$el.present()
}

function backModal() {
    if (router.currentRoute.value.path != '/setup/choose-pin') router.back()
}

function closeModal() {
    modal.value.$el.dismiss()
}

onMounted(() => {
    backVisible.value = !NO_BACK_PATHS.includes(router.currentRoute.value.path)
})

</script>