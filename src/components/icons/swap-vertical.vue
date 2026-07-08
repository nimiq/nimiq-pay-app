<script setup lang="ts">
import { motion } from 'motion-v'

// APP-169: the two arrows pulse apart and back to hint the amount denomination can be switched, then
// rest (neutral) for repeatDelay before pulsing again. Wrap each arrow in a <motion.g> (SVG group
// transforms are reliable; a bare <path> CSS transform is not). A small static x offset keeps the
// arrows a touch further apart at rest.
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <motion.g
      :initial="{ x: -0.8, y: 0 }"
      :animate="{ x: -0.8, y: [0, -4, 0] }"
      :transition="{ duration: 0.8, ease: 'backInOut', repeat: Infinity, repeatDelay: 3 }"
      class="ring-0 outline-none"
    >
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 19.5V5.5M8 5.5 4.5 9M8 5.5 11.5 9" />
    </motion.g>
    <motion.g
      :initial="{ x: 0.8, y: 0 }"
      :animate="{ x: 0.8, y: [0, 4, 0] }"
      :transition="{ duration: 0.8, ease: 'backInOut', repeat: Infinity, repeatDelay: 3 }"
      class="ring-0 outline-none"
    >
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M16 4.5V18.5M16 18.5 12.5 15M16 18.5 19.5 15" />
    </motion.g>
  </svg>
</template>
