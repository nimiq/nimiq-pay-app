export const isDev = import.meta.env.DEV

export const nimiqDomainUrl = isDev ? 'nimiq-testnet.com' : 'nimiq.com'

export const walletUrl = new URL(`https://wallet.${nimiqDomainUrl}`)

export const fastspotAddress = [
  // Fastspot Demo
  'NQ53 SQNM 36RL F333 PPBJ KKRC RE33 2X06 1HJA',
  // Fastspot GO
  'NQ56 VE9K PV0Y TK4T QBMY 8E9G B85J QR6M MSHL',
  // Fastspot (Testnet)
  'NQ17 D2ES UBTP N14D RG4E 2KBK 217A 2GH2 NNY1',
  // Fastspot (Testnet)
  'NQ62 G15X CPF5 XCDU JKMB N3JX KTPP C038 6PV5',
]
