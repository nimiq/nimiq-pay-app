<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'
import { IonButton, IonButtons, IonIcon } from '@ionic/vue'
import { chevronBackOutline } from 'ionicons/icons'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { StorageManager } from '@/lib/storage-manager'
import { ModalType, useModal } from '@/composables/useModal'

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
      showModal(ModalType.NewPhone)
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

<style scoped>
input.pin {
  font-size: 40px;
  padding-left: clamp(10px, 8vw, 10rem);
  letter-spacing: clamp(10px, 8vw, 10rem);
  @apply w-full text-center caret-transparent border-0 mx-10;
}

input.pin.wrong-pin {
  outline-color: red;
  animation: shake 0.5s;
}

@keyframes shake {
  0%  { transform: translateX( 3px); }
  10% { transform: translateX(-3px); }
  20% { transform: translateX( 3px); }
  30% { transform: translateX(-3px); }
  40% { transform: translateX( 3px); }
  50% { transform: translateX(-3px); }
  60% { transform: translateX( 3px); }
  70% { transform: translateX(-3px); }
  80% { transform: translateX( 3px); }
  90% { transform: translateX(-3px); }
  to  { transform: translateX( 0px); }
}
</style>
