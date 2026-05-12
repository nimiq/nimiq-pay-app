declare global {
  interface Window {
    /** Host APIs exposed by Nimiq Pay when running as a mini app. */
    nimiqPay?: {
      readonly language?: string
      /**
       * Request a pseudonymous, per-origin device identifier (64-char hex SHA-256).
       * Prompts the user on first call per origin; subsequent calls auto-resolve.
       * @param options.reason - shown verbatim to the user
       * @throws if the user denies the prompt
       */
      requestDeviceIdentifier: (options: { reason: string }) => Promise<string>
    }
  }
}

export {}
