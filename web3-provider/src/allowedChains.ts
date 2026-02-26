export enum AllowedEvmChainId {
  Ethereum = 1,
  Polygon = 137,
  ArbitrumOne = 42161,
  Optimism = 10,
  Base = 8453,
  BnbSmartChain = 56,
  Sepolia = 11155111,
}

export const ALLOWED_EVM_CHAIN_IDS = new Set<number>([
  AllowedEvmChainId.Ethereum,
  AllowedEvmChainId.Polygon,
  AllowedEvmChainId.ArbitrumOne,
  AllowedEvmChainId.Optimism,
  AllowedEvmChainId.Base,
  AllowedEvmChainId.BnbSmartChain,
  AllowedEvmChainId.Sepolia,
])

export const EVM_CHAIN_NAMES: Record<number, string> = {
  [AllowedEvmChainId.Ethereum]: 'Ethereum',
  [AllowedEvmChainId.Polygon]: 'Polygon',
  [AllowedEvmChainId.ArbitrumOne]: 'Arbitrum One',
  [AllowedEvmChainId.Optimism]: 'Optimism',
  [AllowedEvmChainId.Base]: 'Base',
  [AllowedEvmChainId.BnbSmartChain]: 'BNB Smart Chain',
  [AllowedEvmChainId.Sepolia]: 'Sepolia',
}
