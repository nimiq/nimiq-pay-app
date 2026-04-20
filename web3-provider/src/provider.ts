import type { IRequestArguments } from '@trustwallet/web3-provider-core'
import type { NativeFunctions, WebviewFunctions } from './birpc-types'
// eslint-disable-next-line unicorn/prefer-node-protocol
import { Buffer } from 'buffer'
import { NimiqProvider } from '@nimiq/web3-provider-nimiq'
import { Web3Provider } from '@trustwallet/web3-provider-core'
import { EthereumProvider } from '@trustwallet/web3-provider-ethereum'
import { createBirpc } from 'birpc'
import { ALLOWED_EVM_CHAIN_IDS } from './allowedChains'
import { handleAddEthereumChain, handleSwitchEthereumChain } from './chain-request-handler'
import { generateUUID } from './utils'

/** Chains added dynamically via wallet_addEthereumChain (session-scoped) */
const dynamicChainIds = new Set<number>()

function isChainAvailable(chainId: number): boolean {
  return ALLOWED_EVM_CHAIN_IDS.has(chainId) || dynamicChainIds.has(chainId)
}

// Enable debug logging - disabled by default in production build
// In development, the script can set window.__NIMIQ_PAY_DEBUG__ = true
function log(...args: unknown[]) {
  // Check for debug flag on window (safe for browsers)
  // if (typeof window !== 'undefined' && (window as unknown as { __NIMIQ_PAY_DEBUG__?: boolean }).__NIMIQ_PAY_DEBUG__) {
  //   // eslint-disable-next-line no-console
  //   console.log('[Provider]', ...args)
  // }
  // TODO: Use code above when ready for production
  // For now, always log
  // eslint-disable-next-line no-console
  console.log('[Provider]', ...args)
}

/** Type guard for objects with a chainId property */
function hasChainId(obj: unknown): obj is { chainId: unknown } {
  return typeof obj === 'object' && obj !== null && 'chainId' in obj
}

// Ensure Buffer exists for webviews that don't provide a Node global (iOS WKWebView).
const globalObj = globalThis as typeof globalThis & { Buffer?: typeof Buffer }
if (typeof globalObj.Buffer === 'undefined') {
  globalObj.Buffer = Buffer
}

const nimiqRpc = (typeof window !== 'undefined' && window.__NIMIQ_RPC_URL__) || 'https://rpc.nimiqwatch.com'
const ethRpc = (typeof window !== 'undefined' && window.__ETH_RPC_URL__) || 'https://rpc.mevblocker.io/'

const Nimiq = new NimiqProvider({
  rpc: nimiqRpc,
})
const Ethereum = new EthereumProvider({
  chainId: '0x1', // Ethereum mainnet
  rpc: ethRpc,
})

const birpc = createBirpc<NativeFunctions, WebviewFunctions>({
  updateRpcUrl: (rpcUrl: string) => {
    Ethereum.setRPCUrl(rpcUrl)
    log(`Updated RPC URL to ${rpcUrl}`)
  },
}, {
  post: data => window.mobileApp?.postMessage({ detail: data }),
  on: (fn) => {
    window.addEventListener('messageFromNative', ((event: CustomEvent) => {
      if (event.detail)
        fn(event.detail)
    }) as EventListener)
  },
  eventNames: ['onChainChanged', 'onChainAdded', 'onUnsupportedChain'],
  timeout: 120_000,
})

const provider = new Web3Provider({
  strategy: 'CALLBACK',
  handler: (params) => {
    log('Dapp requested:', params)
    switch (params.name) {
      case 'switchEthereumChain':
        if (hasChainId(params.object)) {
          void handleSwitchEthereumChain(params, {
            requestChainApproval: request => birpc.requestChainApproval(request),
            isChainAvailable,
            addDynamicChain: chainId => dynamicChainIds.add(chainId),
            setChainId: chainId => Ethereum.setChainId(chainId),
            setRpcUrl: rpcUrl => Ethereum.setRPCUrl(rpcUrl),
            emitChainAdded: (chainId, rpcUrl) => birpc.onChainAdded.asEvent(chainId, rpcUrl),
            emitChainChanged: chainId => birpc.onChainChanged.asEvent(chainId),
            emitUnsupportedChain: chainId => birpc.onUnsupportedChain.asEvent(chainId),
            sendResponse: (id, result) => {
              if (id)
                provider.sendResponse(id, result)
            },
            sendError: (id, error) => {
              if (id)
                provider.sendError(id, error)
            },
          }).catch((error: any) => {
            if (params.id) {
              provider.sendError(params.id, {
                code: error?.code ?? -32603,
                message: error?.message ?? 'Unknown error',
              })
            }
          })
        }
        break

      case 'addEthereumChain':
        if (hasChainId(params.object)) {
          void handleAddEthereumChain(params, {
            requestChainApproval: request => birpc.requestChainApproval(request),
            isChainAvailable,
            addDynamicChain: chainId => dynamicChainIds.add(chainId),
            setChainId: chainId => Ethereum.setChainId(chainId),
            setRpcUrl: rpcUrl => Ethereum.setRPCUrl(rpcUrl),
            emitChainAdded: (chainId, rpcUrl) => birpc.onChainAdded.asEvent(chainId, rpcUrl),
            emitChainChanged: chainId => birpc.onChainChanged.asEvent(chainId),
            emitUnsupportedChain: chainId => birpc.onUnsupportedChain.asEvent(chainId),
            sendResponse: (id, result) => {
              if (id)
                provider.sendResponse(id, result)
            },
            sendError: (id, error) => {
              if (id)
                provider.sendError(id, error)
            },
          }).catch((error: any) => {
            if (params.id) {
              provider.sendError(params.id, {
                code: error?.code ?? -32603,
                message: error?.message ?? 'Unknown error',
              })
            }
          })
        }
        break

      default: {
        const { id, ...requestParams } = params
        birpc.handleRequest(requestParams)
          .then(result => provider.sendResponse(id!, result))
          .catch((error: any) => provider.sendError(id!, {
            code: error.code ?? -32603,
            message: error.message ?? 'Unknown error',
          }))
        break
      }
    }
  },
})
  .registerProvider(Nimiq)
  .registerProvider(Ethereum)

const NIMIQ_PAY_ICON = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%20124%20124%22%3E%3Crect%20width%3D%22124%22%20height%3D%22124%22%20fill%3D%22url(%23a)%22%20rx%3D%2230.031%22%2F%3E%3Cpath%20fill%3D%22url(%23b)%22%20d%3D%22m83.086%2038.01-9.004-15.654a3.608%203.608%200%200%200-3.122-1.806H52.951a3.59%203.59%200%200%200-3.115%201.806L40.83%2038.01a3.627%203.627%200%200%200%200%203.613l9.005%2015.653a3.59%203.59%200%200%200%203.115%201.807h18.01a3.59%203.59%200%200%200%203.115-1.807l9.004-15.654a3.612%203.612%200%200%200%20.006-3.612Z%22%2F%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M33.322%2096.098V73.25h10.144c2.507%200%204.419.605%205.737%201.815%201.318%201.21%201.977%202.873%201.977%204.99%200%202.097-.66%203.76-1.977%204.992-1.318%201.231-3.23%201.847-5.737%201.847h-5.963v9.204h-4.18Zm4.181-12.51h5.477c1.383%200%202.42-.302%203.112-.907.69-.627%201.037-1.502%201.037-2.625%200-1.124-.346-1.988-1.037-2.593-.692-.626-1.729-.94-3.112-.94h-5.477v7.065ZM60.15%2096.422c-1.425%200-2.679-.335-3.759-1.004-1.08-.692-1.923-1.675-2.528-2.95-.605-1.274-.907-2.798-.907-4.57%200-1.77.302-3.283.907-4.536.605-1.275%201.448-2.247%202.528-2.917%201.08-.692%202.334-1.037%203.76-1.037%201.382%200%202.592.345%203.63%201.037%201.058.67%201.76%201.577%202.106%202.722h-.357l.357-3.435h3.889c-.065.67-.13%201.35-.194%202.041a32.738%2032.738%200%200%200-.065%202.042v12.283h-4.019l-.032-3.37h.389c-.346%201.123-1.048%202.02-2.107%202.69-1.059.67-2.258%201.004-3.597%201.004Zm1.135-3.111c1.275%200%202.3-.443%203.079-1.329.777-.907%201.166-2.268%201.166-4.083%200-1.815-.389-3.165-1.166-4.051-.778-.886-1.804-1.33-3.08-1.33-1.274%200-2.3.444-3.078%201.33-.778.886-1.167%202.236-1.167%204.05%200%201.816.378%203.177%201.135%204.084.777.886%201.815%201.329%203.11%201.329ZM74.885%20103.455l-.94-3.209c1.016-.216%201.87-.464%202.56-.745.692-.28%201.264-.648%201.718-1.102.454-.454.832-1.037%201.135-1.75l.81-1.912-.098%201.588-7.13-16.593h4.311l5.12%2012.769h-.94l5.154-12.77h4.083l-7.454%2017.275c-.497%201.166-1.037%202.128-1.62%202.884-.584.778-1.21%201.394-1.88%201.847a8.076%208.076%200%200%201-2.204%201.102c-.8.259-1.674.465-2.625.616Z%22%2F%3E%3Cdefs%3E%3CradialGradient%20id%3D%22a%22%20cx%3D%220%22%20cy%3D%220%22%20r%3D%221%22%20gradientTransform%3D%22rotate(-180%2062%2062)%20scale(124)%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%23260133%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%231F2348%22%2F%3E%3C%2FradialGradient%3E%3CradialGradient%20id%3D%22b%22%20cx%3D%220%22%20cy%3D%220%22%20r%3D%221%22%20gradientTransform%3D%22matrix(43.2326%200%200%2043.3604%2072.861%2058.58)%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%23EC991C%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23E9B213%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3C%2Fsvg%3E'

const providerInfo = {
  uuid: generateUUID(),
  name: 'Nimiq Pay',
  icon: NIMIQ_PAY_ICON,
  rdns: 'com.nimiq.pay',
}

function announceProvider() {
  const event = new CustomEvent('eip6963:announceProvider', {
    detail: Object.freeze({ info: providerInfo, provider: Ethereum }),
  })
  window.dispatchEvent(event)
}

window.addEventListener('eip6963:requestProvider', () => {
  log('EIP-6963 provider requested')
  announceProvider()
})

window.nimiq = Nimiq
window.ethereum = Ethereum

// Expose host-provided context (selected user language, etc.) to mini apps.
// Frozen to keep the surface read-only from the dapp side.
window.nimiqPay = Object.freeze({ language: window.__NIMIQ_PAY__?.lang })

// Announce provider immediately for EIP-6963 discovery
announceProvider()

// Dispatch EIP-1193 initialization event for dApp compatibility
window.dispatchEvent(new Event('ethereum#initialized'))

// Extra logs for debugging
// TODO: Remove or conditionally compile out in production
const originalRequest = window.ethereum.request.bind(window.ethereum)
window.ethereum.request = async <T>(args: IRequestArguments): Promise<T> => {
  try {
    const res = await originalRequest(args)
    // eslint-disable-next-line no-console
    console.log('eth.request OK', args?.method, res)
    return res as T
  }
  catch (e) {
    console.error('eth.request ERR', args?.method, e)
    throw e
  }
}
