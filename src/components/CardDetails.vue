<script setup lang="ts">
defineProps<{ cardNumber?: string, cvv?: string, expiryDate?: string }>()
</script>

<template>
  <div>
    <h2 class="text-[13px] font-bold tracking-wider uppercase text-space/60 lh-none">
      {{ $t('Card details') }}
    </h2>
    <div class="grid grid-cols-[auto,1fr] grid-rows-2 gap-6 mt-4">
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
</template>
