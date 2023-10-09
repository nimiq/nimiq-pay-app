import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';

const routes: Array<RouteRecordRaw> = [
    { 
        path: '/app', component: () => import('@/views/AppView.vue'),
        children: [
            { path: 'pay', component: () => import('@/views/app/PayView.vue') },
            { path: 'pay/confirm', component: () => import('@/views/app/PayConfirmView.vue') }
        ]
    },
    { path: '/pin', component: () => import('@/views/PinView.vue') },
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
