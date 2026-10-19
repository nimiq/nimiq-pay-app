import '@nimiq/mini-app-sdk'

declare module '@nimiq/mini-app-sdk' {
  interface NimiqPayHostContext {
    readonly widgets?: {
      add: (id: string) => Promise<boolean>
      update: (id: string, state: Record<string, unknown> | null) => Promise<boolean>
      remove: (id: string) => Promise<void>
      list: () => Promise<string[]>
    }
  }
}

export {}
