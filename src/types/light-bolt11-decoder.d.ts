interface LightningNetworkSection {
  name: 'lightning_network'
  letters: string
}

interface CoinNetworkSection {
  name: 'coin_network'
  letters: string
  value: {
    bech32: string
    pubKeyHash: number
    scriptHash: number
    validWitnessVesion: number[]
  }
}

interface AmountSection {
  name: 'amount'
  letters: string
  value: string
}

interface SeparatorSection {
  name: 'separator'
  letters: string
}

interface TimestampSection {
  name: 'timestamp'
  letters: string
  value: number
}

interface PaymentHashSection {
  name: 'payment_hash'
  letters: string
  value: string
  tag: string
}

interface DescriptionSection {
  name: 'description'
  letters: string
  value: string
  tag: string
}

interface MinFinalCltvExpirySection {
  name: 'min_final_cltv_expiry'
  letters: string
  value: number
  tag: string
}

interface ExpirySection {
  name: 'expiry'
  letters: string
  value: number
  tag: string
}

interface PaymentSecretSection {
  name: 'payment_secret'
  letters: string
  value: string
  tag: string
}

interface FeatureBitsSection {
  name: 'feature_bits'
  letters: string
  value: any // TODO
  tag: string
}

interface SignatureSection {
  name: 'signature'
  letters: string
  value: string
}

interface ChecksumSection {
  name: 'checksum'
  letters: string
}

type Section = LightningNetworkSection | CoinNetworkSection | AmountSection | SeparatorSection | TimestampSection | PaymentHashSection | DescriptionSection | MinFinalCltvExpirySection | ExpirySection | PaymentSecretSection | FeatureBitsSection | SignatureSection | ChecksumSection

declare module 'light-bolt11-decoder' {
  export function decode(url: string): {
    expiry: number
    paymentRequest: string
    route_hints: any[]
    sections: Section[]
    description: string
    description_hash: string | undefined
    fallback_address: string | undefined
    feature_bits: any
    metadata: any | undefined
    min_final_cltv_expiry: number
    payee: string | undefined
    payment_hash: string
    payment_secret: string | undefined
  }
}
