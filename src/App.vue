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
</style>

<script setup lang="ts">
import { IonApp, IonRouterOutlet, IonIcon } from '@ionic/vue';
</script>
