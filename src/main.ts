import { createApp } from 'vue'
import { IonicVue } from '@ionic/vue'
import VueVirtualScroller from 'vue-virtual-scroller'

// import { applyPolyfills, defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader'
import { JeepSqlite } from 'jeep-sqlite/dist/components/jeep-sqlite'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

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

/* Vue Virtual Scroller */
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

/* Libs */
import { useConn } from './stores/conn'
import { useDecrypt } from './composables/useDecrypt'
import { useDevice } from './composables/useDevice'
import { useNimiqNetwork } from './stores/useNimiqNetwork'

// applyPolyfills().then(() => jeepSqlite(window))
customElements.define('jeep-sqlite', JeepSqlite)

window.addEventListener('DOMContentLoaded', async () => {
  const app = createApp(App)
  app.use(IonicVue)
  app.use(createPinia())

  /**
   * Ensures that all the streams which the app relies on are initialized.
   * This is called from:
   *    - When the app is initialized AND the local wallet exists
   *    - When the setup flow is finished
   */

  await useConn().init()
  useNimiqNetwork().init()

  const { isWeb } = useDevice()

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

  app.use(router)
  app.use(VueVirtualScroller)

  await router.isReady()

  app.mount('#app')
})
