import { copyFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import poLoader from 'webpack-i18n-tools/loader/rollup'
import poOptimizer from 'webpack-i18n-tools/optimizer/rollup'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [
      wasm(),
      topLevelAwait(),
      vue(),
      poLoader(),
      poOptimizer(),
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
      {
        name: 'copy-web3-provider:serve',
        apply: () => true, // apply for both 'serve' (dev server) and 'build'
        buildStart() {
          try {
            copyFileSync('./web3-provider/dist/provider.js', 'public/web3-provider.js')
            console.log('📋 Copied web3 provider script')
          }
          catch {
            console.error('🚫 ERROR: Failed to copy web3 provider script, make sure you have built the "web3-provider" directory!')
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
    build: {
      target: 'esnext',
    },
    test: {
      globals: true,
      environment: 'jsdom',
      testTimeout: 20000,
      hookTimeout: 20000,
      retry: process.env.CI ? 2 : 0,
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
      __ENABLE_MINI_APPS__: env.VITE_ENABLE_MINI_APPS === 'true',
      __WALKIE_TALKIE_URL__: JSON.stringify(env.VITE_WALKIE_TALKIE_URL),
      __WALKIE_TALKIE_API_KEY__: JSON.stringify(env.VITE_WALKIE_TALKIE_API_KEY),
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
