export const isDev = import.meta.env.DEV

export const nimiqDomainUrl = isDev ? 'nimiq-testnet.com' : 'nimiq.com'

export const walletUrl = new URL(`https://wallet.${nimiqDomainUrl}`)
