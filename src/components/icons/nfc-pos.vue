<script setup lang="ts">
import { motion } from 'motion-v'
</script>

<template>
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clip-path="url(#clip0_2929_2865)">
      <rect width="64" height="64" rx="32" fill="currentColor" fill-opacity="0.2" />
      <motion.g
        :initial="{ scale: 1, y: 0 }"
        :animate="{ scale: 0.75, y: 6 }"
        :transition="{ duration: 1.2, ease: 'backInOut', repeat: Infinity, repeatType: 'reverse', repeatDelay: 1 }"
      >
        <rect x="11" y="22" width="42" height="84" rx="10.5" fill="currentColor" />
        <line x1="28" y1="28" x2="36" y2="28" stroke="#C5DEEC" stroke-width="2.1" stroke-linecap="round" />
      </motion.g>
    </g>
    <defs>
      <clipPath id="clip0_2929_2865">
        <rect width="64" height="64" rx="32" fill="white" />
      </clipPath>
    </defs>
  </svg>
</template>
