import { useDevice } from '@/composables/useDevice'

export const isDev = import.meta.env.DEV

export const nimiqDomainUrl = isDev ? 'nimiq-testnet.com' : 'nimiq.com'

export const walletUrl = new URL(`https://wallet.${nimiqDomainUrl}`)

export const nakaBufferAddresses = [
  'NQ72 F16T 8H2C KVLQ 7QAJ DXA6 85BC E4QU FT7G', // Testnet
  'NQ60 G92X YHN0 0369 U0L0 N9GU FA2Q GBKY UVHA', // Mainnet
]

export const debounceDelay = 1000
export const debounceMaxWait = 3000

export const isNakaEnabled = __ENABLE_NAKA__ && useDevice().isAndroid
