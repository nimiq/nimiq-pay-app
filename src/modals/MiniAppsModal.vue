<script setup lang="ts">
import { IonInput } from '@ionic/vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { useModal } from '@/composables/useModal'
import { ref } from 'vue'

const logger = useLogger('MiniAppModal')

const { showModal, closeModal } = useModal()

const miniAppUrl = ref('')

function openMiniApp() {
  // Logic to open the Mini App would go here
  alert(`Mini App opened: ${miniAppUrl.value}`)
}
</script>

<template>
  <ModalTemplate :close-all="true">
    <div class="w-full h-full flex flex-col">
      <p class="text-space/60 text-sm font-bold text-left uppercase">
        {{ $t('Mini Apps') }}
      </p>

      <form class="m-4 flex flex-col gap-4" @submit.prevent="openMiniApp">
        <label class="text-sm font-medium text-gray-700">
          {{ $t('Mini App URL') }}
        </label>
        <IonInput
          placeholder="Enter URL"
          clearInput
          v-model="miniAppUrl"
        ></IonInput>
        <button
          type="submit"
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
          :disabled="!miniAppUrl"
        >
          {{ $t('Open Mini App') }}
        </button>
      </form>
    </div>
  </ModalTemplate>
</template>

<style scoped>
</style>
