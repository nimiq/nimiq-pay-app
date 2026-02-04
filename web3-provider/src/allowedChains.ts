export enum AllowedEvmChainId {
  Ethereum = 1,
  Polygon = 137,
}

export const ALLOWED_EVM_CHAIN_IDS = new Set<number>([
  AllowedEvmChainId.Ethereum,
  AllowedEvmChainId.Polygon,
])
