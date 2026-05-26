// Augments the published `@nimiq/mini-app-sdk` types until 0.2.0 ships
// `userFiat` upstream. Remove once the dapp depends on a version that includes it.
declare module '@nimiq/mini-app-sdk' {
  interface NimiqPayHostContext {
    readonly userFiat?: 'USD' | 'EUR' | 'CRC' | 'GMD'
  }
}

export {}
