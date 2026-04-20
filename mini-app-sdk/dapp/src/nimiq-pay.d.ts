declare global {
  interface Window {
    /** Read-only host context exposed by Nimiq Pay when running as a mini app. */
    nimiqPay?: { readonly language?: string }
  }
}

export {}
