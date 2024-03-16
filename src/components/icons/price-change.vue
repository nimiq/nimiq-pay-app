<script lang="ts" setup>
defineProps({
  isDown: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 15 12" :style="`transform: ${isDown ? 'scale(-1,1)' : 'none'}`">
    <path
      stroke="currentColor" stroke-linejoin="round" stroke-width="1.6941"
      d="M1 10.9995s2.34924-1.27405 3.5-2.49657c.81157-.86218 1.64819-2.13486 2.3766-3.38815.59084-1.01659 2.30506-.66329 2.36686.5109.06254 1.18838 1.68974 1.4729 2.15184.37625L13.5 1.00684"
    />
  </svg>
</template>
