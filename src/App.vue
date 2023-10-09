<template>
    <ion-app>
        <ion-router-outlet />
    </ion-app>
</template>

<style>
input.pin {
    text-align: center;
    font-size: 40px;
    font-family: monospace;
}

input.phone {
    font-size: 20px;
    font-family: monospace;
}

ion-modal ion-toolbar {
    --border-color: transparent;
    --background: var(--ion-background-color, #fff);
}

body.scanner-active ion-app>:not(ion-modal) {
    display: none;
}

body.scanner-active ion-content, body.scanner-active .ion-page, body.scanner-active ion-modal {
    --background: none;
}
</style>

<script setup lang="ts">
import { IonApp, IonRouterOutlet, IonIcon } from '@ionic/vue';
</script>
