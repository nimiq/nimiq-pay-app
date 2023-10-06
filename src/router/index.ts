import { createRouter, createWebHistory } from '@ionic/vue-router'
import type { RouteRecordRaw } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import PinView from '@/views/PinView.vue'

// TODO: Add animations
// https://ionicframework.com/docs/vue/navigation#navigating-using-useionrouter
const routes: Array<RouteRecordRaw> = [
  // { path: '/', redirect: '/app' },
  { path: '/app', name: 'Home', component: HomeView },
  { path: '/pin', name: 'Pin', component: PinView },
  { path: '/setup', name: 'Setup', component: () => import('@/views/InitialSetupView.vue') },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
