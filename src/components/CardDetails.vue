<script setup lang="ts">
const { show = false } = defineProps<{ show: boolean, cardNumber?: string, cvv?: string, expiryDate?: string }>()
</script>

<template>
  <Transition
    mode="out-in"
    enter-from-class="h-0 scale-[0.95] opacity-0"
    enter-active-class="transition-all duration-500 ease-out overflow-hidden origin-top"
    enter-to-class="scale-100 opacity-100"
    leave-from-class="scale-100 opacity-100"
    leave-active-class="transition-all duration-500 ease-out overflow-hidden origin-top"
    leave-to-class="h-0 scale-[0.95] opacity-0"
  >
    <div v-if="show" class="w-full self-start h-[181px]">
      <h2 class="text-[13px] font-bold tracking-wider uppercase text-space/60 lh-none">
        {{ $t('Card details') }}
      </h2>
      <div class="grid grid-cols-[auto,1fr] grid-rows-2 gap-6 mt-4 w-full">
        <h3 class="text-[15px]/none text-space/60">
          {{ $t('Number') }}
        </h3>
        <p class="text-lg/none text-space font-semibold text-right">
          {{ cardNumber || '**** **** **** ****' }}
        </p>
        <h3 class="text-[15px]/none text-space/60">
          {{ $t('CVV') }}
        </h3>
        <p class="text-lg/none text-space font-semibold text-right">
          {{ cvv || '***' }}
        </p>
        <h3 class="text-[15px]/none text-space/60">
          {{ $t('Expiry date') }}
        </h3>
        <p class="text-lg/none text-space font-semibold text-right">
          {{ expiryDate || '** / **' }}
        </p>
      </div>
    </div>
  </Transition>
</template>
