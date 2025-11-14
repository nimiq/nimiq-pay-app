import type { RouteRecordRaw } from 'vue-router'
import { createRouter, createWebHistory } from '@ionic/vue-router'
import PinView from '@/views/PinView.vue'

// TODO: Add animations
// https://ionicframework.com/docs/vue/navigation#navigating-using-useionrouter
const routes: Array<RouteRecordRaw> = [
  { path: '/pin', name: 'Pin', component: PinView },
  {
    path: '/app/',
    component: () => import('@/views/MainView.vue'),
    children: [
      {
        path: '',
        redirect: '/app/home',
      },
      {
        path: 'home',
        name: 'Home',
        component: () => import('@/views/HomeView.vue'),
      },
      {
        path: 'map',
        name: 'Map',
        component: () => import('@/views/MapView.vue'),
      },
    ],
  },
  { path: '/setup', name: 'Setup', component: () => import('@/views/SetupView.vue') },
  { path: '/alert', name: 'Alert', component: () => import('@/views/AlertView.vue') },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
