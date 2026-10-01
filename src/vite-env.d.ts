/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' bakes mock-data mode into the build (store screenshots). See src/lib/mock-mode.ts */
  readonly VITE_MOCK_DATA?: string
}

declare const __VITE_SERVER_IP__: string

declare const __ENABLE_BTC_LN__: boolean
declare const __ENABLE_BLUECODE__: boolean
declare const __ENABLE_MINI_APPS__: boolean

declare const __WALKIE_TALKIE_URL__: string
declare const __WALKIE_TALKIE_API_KEY__: string
