import { IonicVue } from '@ionic/vue'
import { devtools } from '@vue/devtools'
import { LockdownMode } from 'capacitor-lockdown-mode'

// import { applyPolyfills, defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader'
import { JeepSqlite } from 'jeep-sqlite/dist/components/jeep-sqlite'
import { createPinia, storeToRefs } from 'pinia'
import { createApp } from 'vue'
import VueVirtualScroller from 'vue-virtual-scroller'

import { useDecrypt } from '@/composables/useDecrypt'

import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { i18nRegistration, setLanguage } from '@/i18n/i18n-setup'
import { identifyUser, trackCurrentAppOpen } from '@/lib/analytics'
import { isMockEnabled } from '@/lib/mock-mode'
import { installNodeGlobals } from '@/lib/node-globals'
import { isWasmAvailable } from '@/lib/utils'
import { useApp } from '@/stores/app'
/* Libs */
import { useConn } from '@/stores/conn'

import { useNimiqNetwork } from '@/stores/nimiq-network'
import App from './App.vue'
import router from './router'
import { useMiniApps } from './stores/mini-apps'
import { useNaka } from './stores/naka'
import LockdownScreen from './views/LockdownScreen.vue'
/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'
/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css'

import '@ionic/vue/css/structure.css'

import '@ionic/vue/css/typography.css'
/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/float-elements.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/text-transformation.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'
/* Theme variables */
import './theme/variables.css'

if (import.meta.env.DEV)
  devtools.connect(`http://${window.location.hostname}`, 8098)

// applyPolyfills().then(() => jeepSqlite(window))
customElements.define('jeep-sqlite', JeepSqlite)
installNodeGlobals()

const isAlertRoute = window.location.pathname.startsWith('/alert')

window.addEventListener('DOMContentLoaded', async () => {
  // Legacy PWA SW from pre-plugin builds keeps stale precache after a binary update, hanging the first launch. Clean up once.
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      if (regs.length) {
        const tasks: Promise<unknown>[] = regs.map(r => r.unregister())
        if ('caches' in globalThis)
          tasks.push(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))))
        await Promise.all(tasks)
        location.reload()
        return
      }
    }
    catch (e) {
      console.warn('Legacy SW cleanup failed:', e)
    }
  }

  // iOS Lockdown Mode disables WebAssembly, which the Nimiq client needs. Without this gate
  // `nimiq-network.ts` would throw on `Nimiq.default()` and retry forever, hanging the app.
  // Show a blocking screen instead of booting the normal flow.
  if (useDevice().isIOS && !isWasmAvailable()) {
    const lockdownApp = createApp(LockdownScreen)
    lockdownApp.use(IonicVue)
    lockdownApp.use(createPinia())
    lockdownApp.use(i18nRegistration)
    const { language } = storeToRefs(useApp())
    await setLanguage(language.value)
    lockdownApp.mount('#app')
    // Classify the cause (true Lockdown Mode vs other WASM failure) for diagnostics only.
    LockdownMode.isLockdownModeEnabled()
      .then(result => useLogger('LockdownMode').log('WebAssembly unavailable on iOS', result))
      .catch(() => {})
    return
  }

  const app = createApp(App)
  app.use(IonicVue)
  app.use(createPinia())
  app.use(i18nRegistration)
  if (!isAlertRoute)
    app.use(VueVirtualScroller)

  // load and set the initial language
  const { language } = storeToRefs(useApp())
  setLanguage(language.value)

  /**
   * Ensures that all the streams which the app relies on are initialized.
   * This is called from:
   *    - When the app is initialized AND the local wallet exists
   *    - When the setup flow is finished
   */

  if (!isAlertRoute)
    await useConn().init()
  // Mock mode never launches the client: WASM still loads (address parsing needs the Nimiq global),
  // but no consensus/sync is started.
  useNimiqNetwork().init({ launchNimiqClient: !isAlertRoute && !isMockEnabled })
  useLogger().init()
  identifyUser() // Identify user as early as possible to capture all analytics events, including those during app initialization
  if (!isAlertRoute)
    trackCurrentAppOpen('cold_start')
  if (!isAlertRoute) {
    useNaka().init()
    useMiniApps() // computedAsync triggers description fetching on store creation
  }

  const { isWeb } = useDevice()

  if (!isAlertRoute) {
    router.beforeEach((to, from, next) => {
      const isWebAndNoPin = isWeb && !useDecrypt().hasPin()
      const isMobileAndNoDb = !isWeb && !useConn().dbExists

      // Check if setup is completed
      if (isWebAndNoPin || isMobileAndNoDb) {
        if (to.name === 'Setup')
          return next()
        return next({ name: 'Setup', replace: true })
      }

      // Check if the db is unlocked
      if (!useDecrypt().decrypted.value) {
        if (to.name === 'Pin')
          return next()
        return next({ name: 'Pin', replace: true })
      }

      return next()
    })
  }

  // This router navigation guard is to prevent switching to the new route before the language file finished loading.
  // If there are any routes which do not require translations, they can be skipped here.
  router.beforeResolve((to, from, next) => {
    setLanguage(language.value).then(() => next())
  })

  app.use(router)

  await router.isReady()

  app.mount('#app')
})
