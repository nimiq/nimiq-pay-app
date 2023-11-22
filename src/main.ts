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
import { useLocalWallet } from './stores/local-wallet'
import { useNimiqNetwork } from './stores/useNimiqNetwork'

// applyPolyfills().then(() => jeepSqlite(window))
customElements.define('jeep-sqlite', JeepSqlite)

window.addEventListener('DOMContentLoaded', async () => {
  const app = createApp(App)
  app.use(IonicVue)
  app.use(createPinia())
  app.use(router)
  app.use(VueVirtualScroller)

  await router.isReady()

  /**
   * Ensures that all the streams which the app relies on are initialized.
   * This is called from:
   *    - When the app is initialized AND the local wallet exists
   *    - When the setup flow is finished
   */

  await useConn().init()
  useNimiqNetwork().init()

  // TODO Maybe move this logic to a route hook
  if (router.currentRoute.value.path === '/') {
    if (useConn().dbExists && useLocalWallet().hasLocalWallet)
      router.replace('/pin')

    else
      router.replace('/setup')
  }

  app.mount('#app')
})
