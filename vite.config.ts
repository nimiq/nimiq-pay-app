import { copyFileSync } from 'node:fs'
import path from 'node:path'
import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import { ExternalPackageIconLoader } from 'unplugin-icons/loaders'
import IconResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
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
    {
      name: 'copy-issuer-schema:serve',
      apply: () => true, // apply for both 'serve' (dev server) and 'build'
      buildStart() {
        try {
          copyFileSync('../nimiq-pay-issuer-server/nimiq-pay-issuer-common/src/common.schema.ts', 'src/lib/issuer-schemas/common.schema.ts')
          copyFileSync('../nimiq-pay-issuer-server/nimiq-pay-issuer-common/src/rest.schema.ts', 'src/lib/issuer-schemas/rest.schema.ts')
          copyFileSync('../nimiq-pay-issuer-server/nimiq-pay-issuer-common/src/ws.schema.ts', 'src/lib/issuer-schemas/ws.schema.ts')
          console.log('📋 Copied issuer server schemas')
        }
        catch (err) {
          console.error('🚫 ERROR: Failed to copy issuer server schemas, make sure you have the "nimiq-pay-issuer-server" repo cloned next to this "nimiq-pay-app" repo!')
          throw err
        }
      },
    },
    Components({
      dirs: [], // We don't auto-import at the moment, just icons
      resolvers: [
        IconResolver({ customCollections: ['nimiq'] }),
      ],
    }),
    Icons({
      customCollections: ExternalPackageIconLoader('@iconify-json/nimiq'),
    }),
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
  },
})
