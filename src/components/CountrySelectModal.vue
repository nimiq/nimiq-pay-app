<script setup lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { close, search } from 'ionicons/icons'
import { IonButtons, IonContent, IonHeader, IonIcon, IonRadio, IonRadioGroup, IonToolbar, modalController } from '@ionic/vue'
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { getCountries, getCountryCallingCode } from 'libphonenumber-js/mobile'
import { useApp } from '@/stores/app'

const { language } = storeToRefs(useApp())

const regionNames = computed(() => new Intl.DisplayNames([language.value], { type: 'region' }))
const countryFilter = ref('')
const countries = computed(() => {
  return getCountries()
    .map((country) => {
      const callingCode = getCountryCallingCode(country)
      return {
        countryCode: country,
        callingCode,
        countryName: regionNames.value.of(country) || country,
      }
    })
    .filter(country => country.countryName.toLowerCase().includes(countryFilter.value.toLowerCase()) || country.countryCode.toLowerCase().includes(countryFilter.value.toLowerCase()) || country.callingCode.includes(countryFilter.value))
    .sort((a, b) => a.countryName.localeCompare(b.countryName))
})
const selectedCountry = ref(countries.value.find(country => country.countryCode === (new Intl.Locale(navigator.language)).region) || countries.value[0])

function handleClose() {
  modalController.dismiss(selectedCountry.value, 'confirm')
}
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <button aria-label="close country modal" class="px-3 py-2" @click.stop="handleClose">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </button>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent>
    <div class="relative pb-2 mt-2 transition-colors border-0 border-b-2 rounded-none border-sky-sky-200 focus-within:border-sky-sky-600">
      <IonIcon :icon="search" class="absolute top-2 left-6 text-space/60" />
      <input
        type="text"
        class="w-full h-8 px-4 pl-12 border-none focus:outline-none focus:ring-0"
        :placeholder="$t('Search for a country')"
        @input="countryFilter = ($event.target as HTMLTextAreaElement).value"
      >
    </div>
    <IonRadioGroup @ion-change="(e) => selectedCountry = e.detail.value">
      <RecycleScroller
        v-slot="{ item }"
        class="py-4 px-6 h-[calc(100%-62px)]"
        :items="countries"
        :item-size="36"
        key-field="countryCode"
      >
        <IonRadio :value="item" label-placement="end" justify="start" :aria-label="item.countryName">
          <div class="flex justify-between w-full">
            <span>
              {{ item.countryName }}
            </span>
            <span class="text-space/60">
              +{{ item.callingCode }}
            </span>
          </div>
        </IonRadio>
      </RecycleScroller>
    </IonRadioGroup>
  </IonContent>
</template>

<style scoped>
ion-radio {
  width: 100%;
}
ion-radio::part(label) {
  width: 100%;
}
</style>
