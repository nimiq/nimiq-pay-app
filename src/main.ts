import { IonicVue } from '@ionic/vue'
import { devtools } from '@vue/devtools'
// import { applyPolyfills, defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader'
import { JeepSqlite } from 'jeep-sqlite/dist/components/jeep-sqlite'

import { createPinia, storeToRefs } from 'pinia'
import { createApp } from 'vue'
import VueVirtualScroller from 'vue-virtual-scroller'
import { useDecrypt } from '@/composables/useDecrypt'

import { useDevice } from '@/composables/useDevice'

import { useLogger } from '@/composables/useLogger'
import { i18nRegistration, setLanguage } from '@/i18n/i18n-setup'
import { useApp } from '@/stores/app'
/* Libs */
import { useConn } from '@/stores/conn'
import { useNimiqNetwork } from '@/stores/nimiq-network'

import App from './App.vue'
import router from './router'
import { useMiniApps } from './stores/mini-apps'
import { useNaka } from './stores/naka'
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

const isAlertRoute = window.location.pathname.startsWith('/alert')

window.addEventListener('DOMContentLoaded', async () => {
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
  useNimiqNetwork().init({ launchNimiqClient: !isAlertRoute })
  useLogger().init()
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
