import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import AppView from '../views/AppView.vue'
import PinView from '../views/PinView.vue'

const routes: Array<RouteRecordRaw> = [
    { path: '/app', component: AppView },
    { path: '/pin', component: PinView },
    {
        path: '/setup', component: () => import('@/views/InitialSetupView.vue'),
        children: [
            { path: 'choose-pin', component: () => import('@/views/setup/PinChooseView.vue') },
            { path: 'confirm-pin', component: () => import('@/views/setup/PinConfirmView.vue') },
            { path: 'enter-phone', component: () => import('@/views/setup/EnterPhoneView.vue') },
            { path: 'confirm-phone', component: () => import('@/views/setup/ConfirmPhoneView.vue') },
            { path: 'get-notified', component: () => import('@/views/setup/GetNotifiedView.vue') },
            { path: 'promo-code', component: () => import('@/views/setup/PromoCodeView.vue') },
        ]
    },
]

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
})

export default router
