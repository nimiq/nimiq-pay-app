import { fileURLToPath, URL } from 'node:url'
import nimiq from '@nimiq/core/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue(), nimiq()],
  server: {
    host: '127.0.0.1',
    port: 5190,
    strictPort: true,
    hmr: false,
    // Vite discovers ordinary parent imports, but does not automatically allow core's worker URL.
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../../node_modules', import.meta.url))] },
    // Fixed upstreams keep recovery words and private keys entirely in the browser.
    proxy: {
      '/cosigner/testnet': { target: 'https://pay-test-cos.nim.sh', changeOrigin: true, rewrite: p => p.replace('/cosigner/testnet', '') },
      '/cosigner/mainnet': { target: 'https://cs1.nimpay.app', changeOrigin: true, rewrite: p => p.replace('/cosigner/mainnet', '') },
      '/faucet': { target: 'https://faucet.pos.nimiq-testnet.com', changeOrigin: true, rewrite: p => p.replace('/faucet', '') },
    },
  },
  test: { environment: 'node', include: ['src/**/*.spec.ts'] },
})
