export const nimAddressRegex = /^NQ[0-9A-Z\s]{34}$/

// TODO Fetch the network from the client
export const nimiqDomainUrl = import.meta.env.DEV ? 'nimiq-testnet.com' : 'nimiq.com'

export const nimCashlinkRegex = new RegExp(`^https://hub\.${nimiqDomainUrl}/cashlink/#([0-9A-Za-z_-]{43})$`)

export const walletUrl = new URL(`https://wallet.${nimiqDomainUrl}`)
