<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'
import { IonButton, IonButtons, IonIcon } from '@ionic/vue'
import { chevronBackOutline } from 'ionicons/icons'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { StorageManager } from '@/lib/storage-manager'
import { Modal, useModal } from '@/composables/useModal'

enum PinType {
  CHOOSE = 'Choose PIN',
  CONFIRM = 'Confirm your PIN',
}

const { showModal } = useModal()
const storageManager = inject(StorageManager.KEY) as StorageManager
const pinField = ref()
const title = ref(PinType.CHOOSE)
const pin = ref('')
const newPin = ref('')

const isBackVisible = computed(() => !!newPin.value)

watch(pin, async (newValue) => {
  if (newValue.length === 4) {
    if (newPin.value && pin.value === newPin.value) {
      await storageManager.setPin(pin.value)
      showModal(Modal.NewPhone)
    }
    else if (newPin.value && pin.value !== newPin.value) {
      pinField.value.setCustomValidity('PINs don\'t match')
      pinField.value.reportValidity()
      pin.value = ''
    }
    else {
      title.value = PinType.CONFIRM
      newPin.value = newValue
      pin.value = ''
    }
  }
})

function backModal() {
  newPin.value = ''
  pin.value = ''
  title.value = PinType.CHOOSE
  shown()
}

function shown() {
  pinField.value.focus()
}

onMounted(() => {
  setTimeout(shown, 200)
})
</script>

<template>
  <ModalTemplate>
    <template #leftButton>
      <IonButtons slot="start" :class="{ hidden: !isBackVisible }">
        <IonButton @click="backModal">
          <IonIcon :icon="chevronBackOutline" />
        </IonButton>
      </IonButtons>
    </template>
    <template #title>
      {{ title }}
    </template>
    <template #subtitle>
      Just a PIN.
      <br>
      No personal data needed.
    </template>
    <input
      ref="pinField" v-model="pin" type="password" inputmode="numeric" class="pin self-start mt-[30%]" pattern="[0-9]*" minlength="4"
      maxlength="4" size="4" placeholder="••••" autofocus="true"
    >
  </ModalTemplate>
</template>
