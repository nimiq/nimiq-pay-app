import path from 'node:path'
import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import poLoader from 'webpack-i18n-tools/loader/rollup'
import poOptimizer from 'webpack-i18n-tools/optimizer/rollup'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    vue({ script: { defineModel: true } }),
    poLoader(),
    poOptimizer(),
    // legacy(),
    VitePWA({ registerType: 'autoUpdate', workbox: { maximumFileSizeToCacheInBytes: 10000000 } }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@nimiq/core'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
  define: {
    __VUE_I18N_FULL_INSTALL__: true, // support <i18-t> component
    __VUE_I18N_LEGACY_API__: true, // We use the legacy api, which is also vue-i18n's default
    __INTLIFY_PROD_DEVTOOLS__: false,
    // __ENABLE_BTC_LN__: process.env.ENABLE_BTC_LN ? true : false,
    __ENABLE_BTC_LN__: true, // Enable BTC LN by default, remove this once Apple is not complaining

    __NQ_FEEDBACK_URL__: JSON.stringify(process.env.NQ_FEEDBACK_URL || 'https://nq-feedback.maximogarciamtnez.workers.dev/'),
    __ENVIRONMENT__: JSON.stringify(process.env.DEV_ENV || process.env.NODE_ENV.includes('dev') ? 'local' : 'prod'),
  },
})
