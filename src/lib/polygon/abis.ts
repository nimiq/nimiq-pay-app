export const POLYGON_TOKEN_APPROVAL_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
]

export const POLYGON_BRIDGED_TOKEN_ABI = [
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'event MetaTransactionExecuted(address userAddress, address relayerAddress, bytes functionSignature)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function getNonce(address user) view returns (uint256 nonce)',
  'function name() view returns (string)',
]

export const POLYGON_TRANSFER_RECIPIENT_ABI = [
  'function getGasAndDataLimits() view returns ((uint256 acceptanceBudget, uint256 preRelayedCallGasLimit, uint256 postRelayedCallGasLimit, uint256 calldataSizeLimit) limits)',
  'function getNonce(address from) view returns (uint256)',
  'function getRequiredRelayGas(bytes4 methodId) view returns (uint256 gas)',
  'function registeredTokenPool(address) view returns (address)',
  'function transfer(address token, uint256 amount, address target, uint256 fee)',
  'function transferWithApproval(address token, uint256 amount, address target, uint256 fee, uint256 approval, bytes32 sigR, bytes32 sigS, uint8 sigV)',
]

export const POLYGON_HTLC_RECIPIENT_ABI = [
  'event Open(bytes32 indexed id, address token, uint256 amount, address recipient, bytes32 hash, uint256 timeout)',
  'event Redeem(bytes32 indexed id, bytes32 secret)',
  'event Refund(bytes32 indexed id)',
  'function getGasAndDataLimits() view returns ((uint256 acceptanceBudget, uint256 preRelayedCallGasLimit, uint256 postRelayedCallGasLimit, uint256 calldataSizeLimit) limits)',
  'function getNonce(address from) view returns (uint256)',
  'function getRequiredRelayGas(bytes4 methodId) view returns (uint256 gas)',
  'function open(bytes32 id, address token, uint256 amount, address refundAddress, address recipientAddress, bytes32 hash, uint256 timeout, uint256 fee)',
  'function openWithApproval(bytes32 id, address token, uint256 amount, address refundAddress, address recipientAddress, bytes32 hash, uint256 timeout, uint256 fee, uint256 approval, bytes32 sigR, bytes32 sigS, uint8 sigV)',
  'function redeemWithSecretInData(bytes32 id, address target, uint256 fee)',
  'function refund(bytes32 id, address target, uint256 fee)',
]

export const POLYGON_RELAY_HUB_ABI = [
  'event RelayServerRegistered(address indexed relayManager, uint256 baseRelayFee, uint256 pctRelayFee, string url)',
  'event TransactionRelayed(address indexed relayManager, address indexed relayWorker, address indexed from, address to, address paymaster, bytes4 selector, uint8 status, uint256 charge)',
  'function calldataGasCost(uint256 calldataSize) view returns (uint256)',
]

export const POLYGON_UNISWAP_POOL_ABI = [
  'function fee() view returns (uint24)',
]

export const POLYGON_UNISWAP_QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) returns (uint256 amountOut)',
]

export const POLYGON_CONVERSION_SWAP_ABI = [
  'function getGasAndDataLimits() view returns (tuple(uint256 acceptanceBudget, uint256 preRelayedCallGasLimit, uint256 postRelayedCallGasLimit, uint256 calldataSizeLimit) limits)',
  'function getNonce(address from) view returns (uint256)',
  'function getRequiredRelayGas(bytes4 methodId) view returns (uint256 gas)',
  'function registeredTokenPool(address) view returns (address)',
  'function swapWithApproval(address token, uint256 amount, address pool, uint256 targetAmount, uint256 fee, uint256 approval, bytes32 sigR, bytes32 sigS, uint8 sigV)',
]
