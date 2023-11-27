export const nimAddressRegex = /^NQ[0-9A-Z\s]{34}$/

// TODO Fetch the network from the client
export const nimCashlinkRegex = import.meta.env.DEV
  ? /^https:\/\/hub\.nimiq-testnet\.com\/cashlink\/#([0-9A-Za-z_-]{43})$/
  : /^https:\/\/hub\.nimiq\.com\/cashlink\/#([0-9A-Za-z_-]{43})$/
