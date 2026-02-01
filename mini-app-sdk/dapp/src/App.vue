<script setup lang="ts">
import { ref } from 'vue';
import HelloWorld from './components/HelloWorld.vue'
import Staking from './components/Staking.vue';

const view = ref('kitchen-sink');
</script>

<template>
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="/vite.svg" class="logo" alt="Vite logo" />
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="./assets/vue.svg" class="logo vue" alt="Vue logo" />
    </a>
  </div>

  <nav style="display: flex; flex-direction: row; justify-content: center; gap: 8px;">
    <button @click="view = 'kitchen-sink'">Kitchen Sink</button>
    <button @click="view = 'staking'">Staking</button>
  </nav>

  <HelloWorld v-if="view === 'kitchen-sink'" />
  <Staking v-if="view === 'staking'" />
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
