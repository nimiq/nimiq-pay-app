export const polygonUsdtConfig = {
  networkId: 137,
  rpcUrl: import.meta.env.VITE_POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
  gasStationUrl: 'https://gasstation.polygon.technology/v2',
  tokenContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as const,
  transferContract: '0x98E69a6927747339d5E543586FC0262112eBe4BD' as const,
  htlcContract: '0xF615bD7EA00C4Cc7F39Faad0895dB5f40891359f' as const,
  earliestHistoryScanHeight: 84_880_826, // Block when USDT was added to Nimiq Pay
  openGsnRelayHubContract: '0x6C28AfC105e65782D9Ea6F2cA68df84C9e7d750d' as const,
  uniswapQuoterContract: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6' as const,
  wrappedNativeTokenContract: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' as const,
  rpcMaxBlockRange: 3_000,
  relayVersionPrefix: '2.',
  preferredRelaySuffixes: ['.fastspot.io'],
  maxRelayCandidates: 10,
} as const
