<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { onBeforeMount, onBeforeUnmount } from 'vue'
import FaceId from '@/components/icons/face-id.vue'
import Fingerprint from '@/components/icons/fingerprint.vue'
import { useBiometric } from '@/composables/useBiometric'
import { useDevice } from '@/composables/useDevice'

defineProps({ errorMsg: { type: String } })
defineEmits<{ done: [], skip: [] }>()

const { isIOS } = useDevice()
const { updateBiometryInfo, addBiometricResumeListener, removeBiometricResumeListener, biometricNotSupportedReason, isBiometricSupported } = useBiometric()

onBeforeMount(async () => {
  await updateBiometryInfo()
  addBiometricResumeListener()
})

onBeforeUnmount(removeBiometricResumeListener)
</script>

<template>
  <div class="w-full h-full flex flex-col items-center">
    <FaceId v-if="isIOS" class="text-space w-20 h-20 flex-1 stroke-2" />
    <Fingerprint v-else class="text-space w-20 h-20 flex-1 stroke-2" />
    <p v-if="biometricNotSupportedReason" class="mt-auto text-pumpkin w-full text-base text-center">
      {{ biometricNotSupportedReason }}
    </p>
    <p v-if="errorMsg" class="mt-auto text-pumpkin w-full text-base text-center">
      {{ errorMsg }}
    </p>
    <div class="w-full flex flex-col justify-center pb-2 mt-8">
      <IonButton size="small" class="text-base font-bold" :disabled="!isBiometricSupported" @click="$emit('done')">
        {{ isIOS ? $t('Enable Touch ID/Face ID') : $t('Enable Fingerprint') }}
      </IonButton>
      <IonButton fill="clear" class="text-base font-bold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="$emit('skip')">
        {{ $t('Skip for now') }}
      </IonButton>
    </div>
  </div>
</template>
