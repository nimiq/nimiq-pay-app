export const isDev = import.meta.env.DEV

export const nimiqDomainUrl = isDev ? 'nimiq-testnet.com' : 'nimiq.com'

export const walletUrl = new URL(`https://wallet.${nimiqDomainUrl}`)

export const nakaBufferAddresses = [
  'NQ72 F16T 8H2C KVLQ 7QAJ DXA6 85BC E4QU FT7G', // Testnet
]

export const debounceDelay = 1000
export const debounceMaxWait = 3000
