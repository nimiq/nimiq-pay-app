<template>
  <ion-toolbar>
    <ion-buttons slot="start" :style="{ display: backVisible ? 'flex' : 'none' }">
      <ion-button @click="backModal">
        <ion-icon :icon="chevronBackOutline" />
      </ion-button>
    </ion-buttons>
    <ion-buttons slot="end">
      <ion-button @click="closeModal">
        <ion-icon :icon="close" />
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
  <ion-content class="ion-padding">
    <ion-router-outlet />
  </ion-content>
</template>
