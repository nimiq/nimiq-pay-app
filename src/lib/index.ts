// TODO Replace with import.meta.env.DEV
export const isDev = true // import.meta.env.DEV

export const nimiqDomainUrl = isDev ? 'nimiq-testnet.com' : 'nimiq.com'

export const nimCashlinkRegex = new RegExp(`^https://hub\.${nimiqDomainUrl}/cashlink/#(?<=\/cashlink\/#)([0-9A-Za-z_-]{54,})(==)$`)

export const walletUrl = new URL(`https://wallet.${nimiqDomainUrl}`)
