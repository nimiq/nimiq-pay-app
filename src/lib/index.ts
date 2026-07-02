import { isTestnet } from '@/lib/network'

export const isDev = import.meta.env.DEV

export { isNetworkOverridden, isTestnet, type NetworkMode, networkOverride, setNetworkOverride } from '@/lib/network'

export const nimiqDomainUrl = isTestnet ? 'nimiq-testnet.com' : 'nimiq.com'

export const walletUrl = new URL(`https://wallet.${nimiqDomainUrl}`)

export const nakaBufferAddresses = [
  'NQ72 F16T 8H2C KVLQ 7QAJ DXA6 85BC E4QU FT7G', // Testnet
  'NQ60 G92X YHN0 0369 U0L0 N9GU FA2Q GBKY UVHA', // Mainnet
]

export const debounceDelay = 1000
export const debounceMaxWait = 3000

// NAKA hidden: the `@apps/capacitor-monetplus-hce` plugin was removed (feature stopped working).
// Hard-disabled here so it stays hidden in committed/CI/release builds (.env is gitignored).
// Re-enable by restoring the original expression below.
export const isNakaEnabled = false
// export const isNakaEnabled = __ENABLE_NAKA__ && (useDevice().isAndroid || isDev)
// export const isBlueCodeEnabled = __ENABLE_BLUECODE__ && (useDevice().isIOS || isDev)
export const isMiniAppsEnabled = __ENABLE_MINI_APPS__
