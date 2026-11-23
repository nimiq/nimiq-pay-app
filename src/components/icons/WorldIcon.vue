<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import WorldCheckIcon from './WorldCheckIcon.vue'

const { consensus } = storeToRefs(useNimiqNetwork())
</script>

<template>
  <div class="consensus-icon">
    <WorldCheckIcon v-if="consensus === 'established'" class="w-full h-full text-space/50 scale-110" />
    <div v-else class="world-icon" />
  </div>
</template>

<style scoped>
svg {
  display: block;
}

.world-icon,
.world-icon::before,
.world-icon::after {
  width: 100%;
  height: 100%;
  background-image: url('../../assets/graphics/consensus-sprite.svg');
  background-repeat: repeat-x;
  background-size: 1000% 300%;
}

.world-icon::before,
.world-icon::after {
  content: '';
  display: block;
  position: absolute;
  left: 0;
  top: 0;
}

.world-icon::before {
  background-position: 0 0;
  animation: top 4.6s steps(10) infinite;
}

.world-icon {
  position: relative;
  background-position: 0 50%;
  animation: center 4.6s steps(10) infinite;
}

.world-icon::after {
  background-position: 0 100%;
  animation: bottom 4.6s steps(10) infinite -0.4s;
}

@keyframes top {
  0% {
    background-position: 0 0;
  }

  8.695% {
    background-position: 0 0;
  }

  17.391% {
    background-position: calc(-10 * 100%) 0;
  }

  26.086% {
    background-position: calc(-20 * 100%) 0;
  }

  34.782% {
    background-position: calc(-30 * 100%) 0;
  }

  43.478% {
    background-position: calc(-40 * 100%) 0;
  }

  47.826% {
    background-position: calc(-40 * 100%) 0;
  }

  56.521% {
    background-position: calc(-30 * 100%) 0;
  }

  65.217% {
    background-position: calc(-20 * 100%) 0;
  }

  73.913% {
    background-position: calc(-10 * 100%) 0;
  }

  82.608% {
    background-position: 0 0;
  }

  91.304% {
    background-position: calc(10 * 100%) 0;
  }

  100% {
    background-position: calc(20 * 100%) 0;
  }
}

@keyframes center {
  0% {
    background-position: 0 50%;
  }

  8.695% {
    background-position: calc(10 * 100%) 50%;
  }

  21.739% {
    background-position: calc(10 * 100%) 50%;
  }

  30.434% {
    background-position: 0 50%;
  }

  39.130% {
    background-position: calc(-10 * 100%) 50%;
  }

  47.826% {
    background-position: calc(-20 * 100%) 50%;
  }

  56.521% {
    background-position: calc(-30 * 100%) 50%;
  }

  65.217% {
    background-position: calc(-40 * 100%) 50%;
  }

  73.913% {
    background-position: calc(-40 * 100%) 50%;
  }

  82.608% {
    background-position: calc(-30 * 100%) 50%;
  }

  91.304% {
    background-position: calc(-20 * 100%) 50%;
  }

  100% {
    background-position: calc(-10 * 100%) 50%;
  }
}

@keyframes bottom {
  0% {
    background-position: 0 100%;
  }

  8.695% {
    background-position: 0 100%;
  }

  17.391% {
    background-position: calc(10 * 100%) 100%;
  }

  26.086% {
    background-position: calc(20 * 100%) 100%;
  }

  34.782% {
    background-position: calc(30 * 100%) 100%;
  }

  43.478% {
    background-position: calc(40 * 100%) 100%;
  }

  47.826% {
    background-position: calc(40 * 100%) 100%;
  }

  56.521% {
    background-position: calc(30 * 100%) 100%;
  }

  65.217% {
    background-position: calc(20 * 100%) 100%;
  }

  73.913% {
    background-position: calc(10 * 100%) 100%;
  }

  82.608% {
    background-position: 0 100%;
  }

  91.304% {
    background-position: calc(-10 * 100%) 100%;
  }

  100% {
    background-position: calc(-20 * 100%) 100%;
  }
}
</style>
