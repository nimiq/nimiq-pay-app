import { copyFileSync } from 'node:fs'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import poLoader from 'webpack-i18n-tools/loader/rollup'
import poOptimizer from 'webpack-i18n-tools/optimizer/rollup'
import { networkInterfaces } from 'node:os'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [
      wasm(),
      topLevelAwait(),
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag.startsWith('chatlio-'),
          },
        },
      }),
      poLoader(),
      poOptimizer(),
      // legacy(),
      VitePWA({ registerType: 'autoUpdate', workbox: { maximumFileSizeToCacheInBytes: 10000000 } }),
      {
        name: 'copy-issuer-schema:serve',
        apply: () => true, // apply for both 'serve' (dev server) and 'build'
        buildStart() {
          try {
            copyFileSync('../nimiq-pay-issuer-server/nimiq-pay-issuer-common/src/bluecode-issuer.schema.ts', 'src/lib/issuer-schemas/bluecode-issuer.schema.ts')
            copyFileSync('../nimiq-pay-issuer-server/nimiq-pay-issuer-common/src/common.schema.ts', 'src/lib/issuer-schemas/common.schema.ts')
            copyFileSync('../nimiq-pay-issuer-server/nimiq-pay-issuer-common/src/rest.schema.ts', 'src/lib/issuer-schemas/rest.schema.ts')
            copyFileSync('../nimiq-pay-issuer-server/nimiq-pay-issuer-common/src/naka-issuer.schema.ts', 'src/lib/issuer-schemas/naka-issuer.schema.ts')
            copyFileSync('../nimiq-pay-issuer-server/nimiq-pay-issuer-common/src/ws.schema.ts', 'src/lib/issuer-schemas/ws.schema.ts')
            console.log('📋 Copied issuer server schemas')
          }
          catch {
            console.error('🚫 ERROR: Failed to copy issuer server schemas, make sure you have the "nimiq-pay-issuer-server" repo cloned next to this "nimiq-pay-app" repo!')
          }
        },
      },
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
      __VITE_SERVER_IP__: JSON.stringify(getLocalIP()),
      __VUE_I18N_FULL_INSTALL__: true, // support <i18-t> component
      __VUE_I18N_LEGACY_API__: true, // We use the legacy api, which is also vue-i18n's default
      __INTLIFY_PROD_DEVTOOLS__: false,
      // __ENABLE_BTC_LN__: process.env.ENABLE_BTC_LN ? true : false,
      __ENABLE_BTC_LN__: true, // Enable BTC LN by default, remove this once Apple is not complaining
      __ENABLE_NAKA__: env.VITE_ENABLE_NAKA === 'true',
      __ENABLE_BLUECODE__: env.VITE_ENABLE_BLUECODE === 'true',
    },
  }
})

// Get local network IP
function getLocalIP() {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}
