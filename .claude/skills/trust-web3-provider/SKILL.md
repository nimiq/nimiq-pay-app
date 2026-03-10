---
name: trust-web3-provider
description: Use when integrating trust-web3-provider for wallet connectivity in web3 dApps. Covers core and ethereum packages with strategy selection, provider setup, and request handling.
user-invocable: true
---

# Trust Web3 Provider Integration

## Quick Reference

| Package | Purpose |
|---------|---------|
| `@trustwallet/web3-provider-core` | Adapter strategies, handler system |
| `@trustwallet/web3-provider-ethereum` | EIP-1193 Ethereum provider |

## When to Use Each Strategy

### PROMISES Strategy (Recommended for most cases)

Use when your handler can **immediately return** a Promise with the result.

**Best for:**
- Web browser environments
- Synchronous request processing
- Simple wallet integrations

```typescript
import { Web3Provider, AdapterStrategy } from '@trustwallet/web3-provider-core';
import { EthereumProvider } from '@trustwallet/web3-provider-ethereum';

const ethereum = new EthereumProvider({ chainId: '0x1' });

new Web3Provider({
  strategy: AdapterStrategy.PROMISES,
  handler: async (params) => {
    // Return result directly
    if (params.name === 'requestAccounts') {
      return ['0x742d35Cc6634C0532925a3b844Bc9e7595f...'];
    }
    throw new Error(`Unknown method: ${params.name}`);
  },
}).registerProvider(ethereum);

window.ethereum = ethereum;
```

### CALLBACK Strategy

Use when responses arrive **asynchronously from external sources** (native bridges).

**Best for:**
- Mobile native bridges (iOS/Android)
- When response crosses JS-native boundary
- Asynchronous external callbacks

```typescript
import { Web3Provider, AdapterStrategy, IHandlerParams } from '@trustwallet/web3-provider-core';
import { EthereumProvider } from '@trustwallet/web3-provider-ethereum';

const ethereum = new EthereumProvider({ chainId: '0x1' });

const provider = new Web3Provider({
  strategy: AdapterStrategy.CALLBACK,
}).registerProvider(ethereum);

// Handler does NOT return result - calls sendResponse later
provider.setHandler((params: IHandlerParams) => {
  // params.id is the request identifier
  sendToNativeBridge(params);
});

// When native bridge responds:
function onNativeResponse(requestId: number, result: any) {
  provider.sendResponse(requestId, result);
}

function onNativeError(requestId: number, error: any) {
  provider.sendError(requestId, error);
}

window.ethereum = ethereum;
```

> **Key Difference:** From the dApp's perspective, both strategies provide identical Promise-based APIs. The choice affects only how YOUR handler implementation works.

## Handler Parameters (IHandlerParams)

Every request passes through your handler with these parameters:

```typescript
interface IHandlerParams {
  id?: number;           // Request ID (only in CALLBACK mode)
  network: string;       // Provider network (e.g., 'ethereum')
  name: string;          // Method name (e.g., 'requestAccounts')
  params: unknown;       // Original request parameters
  object: unknown;       // Alias for params (legacy compatibility)
}
```

### Common Handler Patterns

**Method Routing:**
```typescript
const handler = async (params: IHandlerParams) => {
  switch (params.name) {
    case 'requestAccounts':
      return await wallet.getAccounts();

    case 'signTransaction':
      return await wallet.signTransaction(params.params);

    case 'signPersonalMessage':
      const { data, address } = params.params as { data: string; address: string };
      return await wallet.signMessage(data, address);

    default:
      throw new RPCError(4200, `Unsupported method: ${params.name}`);
  }
};
```

**Network-Aware Handler:**
```typescript
const handler = async (params: IHandlerParams) => {
  if (params.network !== 'ethereum') {
    throw new Error(`Unsupported network: ${params.network}`);
  }
  // Process ethereum-specific request
};
```

## Ethereum Provider Configuration

### Constructor Options

```typescript
interface IEthereumProviderConfig {
  chainId?: string;              // Hex chain ID (e.g., '0x1' for mainnet)
  rpc?: string;                  // RPC endpoint URL
  address?: string;              // Pre-set account address
  overwriteMetamask?: boolean;   // Set isMetaMask = true
  isTrust?: boolean;             // Set isTrust flags (default: true)
  unsupportedMethods?: string[]; // Block specific methods
  disableMobileAdapter?: boolean;// Disable method transformation
}
```

### Option Details

#### `overwriteMetamask`

**What it does:** Sets `isMetaMask = true` on the provider instance.

**When to use:**
- When dApps only check for MetaMask and ignore other wallets
- To maximize compatibility with dApps that have hardcoded MetaMask detection
- When you want your wallet to appear as MetaMask to legacy dApps

```typescript
const ethereum = new EthereumProvider({
  overwriteMetamask: true,
});
// ethereum.isMetaMask === true
```

> **Note:** Modern dApps should use EIP-6963 for wallet detection. Use this only for backward compatibility.

#### `isTrust`

**What it does:** Sets Trust Wallet identification flags (`isTrust`, `isTrustWallet`) on the provider. Defaults to `true`.

**When to use:**
- Set to `true` (default) when building Trust Wallet integrations
- Set to `false` when building a custom wallet that shouldn't identify as Trust Wallet
- Useful for white-label wallet solutions

```typescript
// Custom wallet - don't identify as Trust
const ethereum = new EthereumProvider({
  isTrust: false,
});
// ethereum.isTrust === false
// ethereum.isTrustWallet === false
```

#### `disableMobileAdapter`

**What it does:** Disables the built-in method name transformation that converts standard Ethereum JSON-RPC methods to handler-friendly names.

**When to use:**
- When you want to receive raw method names in your handler (e.g., `eth_requestAccounts` instead of `requestAccounts`)
- When building a pass-through proxy that forwards requests unchanged
- When your backend expects standard JSON-RPC method names

```typescript
// With disableMobileAdapter: false (default)
// dApp calls: eth_requestAccounts → handler receives: requestAccounts
// dApp calls: personal_sign → handler receives: signPersonalMessage

// With disableMobileAdapter: true
// dApp calls: eth_requestAccounts → handler receives: eth_requestAccounts
// dApp calls: personal_sign → handler receives: personal_sign

const ethereum = new EthereumProvider({
  disableMobileAdapter: true,
});
```

> **Warning:** Enabling this requires your handler to process all standard Ethereum method names directly.

### Common Configurations

**Standard Web Integration:**
```typescript
const ethereum = new EthereumProvider({
  chainId: '0x1',
  rpc: 'https://eth.llamarpc.com',
});
```

**MetaMask Compatibility Mode:**
```typescript
const ethereum = new EthereumProvider({
  chainId: '0x1',
  overwriteMetamask: true,  // dApps see isMetaMask = true
});
```

**Restricted Methods:**
```typescript
const ethereum = new EthereumProvider({
  chainId: '0x1',
  unsupportedMethods: ['eth_sign'],  // Block dangerous methods
});
```

### Runtime Updates

```typescript
ethereum.setChainId('0x89');                    // Switch to Polygon
ethereum.setAddress('0x...');                   // Update account
ethereum.setRPCUrl('https://polygon-rpc.com'); // Update RPC
```

## Supported Ethereum Methods

### Static Methods (No Handler Call)

These return cached values without invoking your handler:

| Method | Returns | Notes |
|--------|---------|-------|
| `eth_chainId` | `'0x1'` | Hex chain ID |
| `net_version` | `1` | Decimal chain ID |
| `eth_accounts` | `['0x...']` | Cached after requestAccounts |
| `eth_coinbase` | `'0x...'` | Same as eth_accounts[0] |

### Handler Methods (Transformed)

These invoke your handler with normalized parameters:

| dApp Calls | Handler Receives (`params.name`) |
|------------|----------------------------------|
| `eth_requestAccounts` | `requestAccounts` |
| `personal_sign` | `signPersonalMessage` |
| `eth_sign` | `signMessage` or `signPersonalMessage` |
| `eth_signTypedData` | `signTypedMessage` (v1) |
| `eth_signTypedData_v3` | `signTypedMessage` (v3) |
| `eth_signTypedData_v4` | `signTypedMessage` (v4) |
| `eth_sendTransaction` | `signTransaction` |
| `wallet_watchAsset` | `watchAsset` |
| `wallet_addEthereumChain` | `addEthereumChain` |
| `wallet_switchEthereumChain` | `switchEthereumChain` |

### RPC Fallback

Any method not listed above falls through to the configured RPC endpoint:
- `eth_blockNumber`, `eth_getBalance`, `eth_call`, `eth_getLogs`, etc.

## Event Handling

The Ethereum provider emits EIP-1193 standard events:

```typescript
// Connection established
ethereum.on('connect', (info: { chainId: string }) => {
  console.log('Connected to chain:', info.chainId);
});

// Account changed
ethereum.on('accountsChanged', (accounts: string[]) => {
  if (accounts.length === 0) {
    console.log('Wallet disconnected');
  } else {
    console.log('Active account:', accounts[0]);
  }
});

// Chain changed
ethereum.on('chainChanged', (chainId: string) => {
  console.log('Switched to chain:', chainId);
  // Recommended: reload the page
  window.location.reload();
});

// Disconnection
ethereum.on('disconnect', (error: { code: number; message: string }) => {
  console.error('Disconnected:', error.message);
});
```

### Emitting Events (from your wallet implementation)

```typescript
// Notify dApp of account change
ethereum.emit('accountsChanged', ['0xNewAddress...']);

// Notify dApp of chain change
ethereum.emit('chainChanged', '0x89');
```

## Complete Integration Example

### Minimal Wallet Integration

```typescript
import {
  Web3Provider,
  AdapterStrategy,
  IHandlerParams,
  RPCError
} from '@trustwallet/web3-provider-core';
import { EthereumProvider } from '@trustwallet/web3-provider-ethereum';

// 1. Create provider with configuration
const ethereum = new EthereumProvider({
  chainId: '0x1',
  rpc: 'https://eth.llamarpc.com',
});

// 2. Define your request handler
const handler = async (params: IHandlerParams): Promise<any> => {
  console.log(`[${params.network}] ${params.name}`, params.params);

  switch (params.name) {
    case 'requestAccounts':
      // Your wallet logic to get/create accounts
      return ['0x742d35Cc6634C0532925a3b844Bc9e7595f...'];

    case 'signPersonalMessage': {
      const { data, address } = params.params as { data: string; address: string };
      // Your signing logic
      return '0xSignature...';
    }

    case 'signTransaction': {
      // Your transaction signing logic
      return '0xSignedTx...';
    }

    default:
      throw new RPCError(4200, `Method not supported: ${params.name}`);
  }
};

// 3. Wire it together
new Web3Provider({
  strategy: AdapterStrategy.PROMISES,
  handler,
}).registerProvider(ethereum);

// 4. Expose to dApps
window.ethereum = ethereum;

// 5. Announce provider (EIP-6963)
window.dispatchEvent(new Event('ethereum#initialized'));
```

### Testing Your Integration

```typescript
// Test account request
const accounts = await window.ethereum.request({
  method: 'eth_requestAccounts'
});
console.log('Accounts:', accounts);

// Test signing
const signature = await window.ethereum.request({
  method: 'personal_sign',
  params: ['0x48656c6c6f', accounts[0]],  // "Hello" in hex
});
console.log('Signature:', signature);

// Test chain info
const chainId = await window.ethereum.request({ method: 'eth_chainId' });
console.log('Chain:', chainId);
```

## Error Handling

### Using RPCError

```typescript
import { RPCError } from '@trustwallet/web3-provider-core';

const handler = async (params: IHandlerParams) => {
  // User rejection
  if (userCancelled) {
    throw new RPCError(4001, 'User rejected the request');
  }

  // Unsupported method
  if (!supportedMethods.includes(params.name)) {
    throw new RPCError(4200, `Method not supported: ${params.name}`);
  }

  // Invalid params
  if (!params.params) {
    throw new RPCError(-32602, 'Invalid parameters');
  }
};
```

### Standard Error Codes

| Code | Meaning |
|------|---------|
| `4001` | User rejected request |
| `4100` | Unauthorized |
| `4200` | Unsupported method |
| `4900` | Disconnected |
| `4901` | Chain disconnected |
| `-32602` | Invalid params |
| `-32603` | Internal error |

## Troubleshooting

### "No adapter set" Error

```
Error: No adapter set, maybe you forgot to register the provider?
```

**Fix:** Register provider before making requests:
```typescript
new Web3Provider({ strategy, handler }).registerProvider(ethereum);
```

### "Trying to send callback request on promisified adapter"

**Cause:** Calling `sendResponse()` with PROMISES strategy.

**Fix:** Only use `sendResponse/sendError` with CALLBACK strategy:
```typescript
// WRONG with PROMISES
provider.sendResponse(id, result);

// CORRECT with PROMISES - return from handler
return result;
```

### Handler Not Called

**Check:** Static methods (`eth_chainId`, `eth_accounts`, `net_version`) don't invoke handler.

```typescript
// These return cached values - no handler call
ethereum.request({ method: 'eth_chainId' });
ethereum.request({ method: 'eth_accounts' });
```

### dApp Doesn't Detect Provider

**Fix:** Dispatch initialization event:
```typescript
window.ethereum = ethereum;
window.dispatchEvent(new Event('ethereum#initialized'));
```
