import type { NimiqProvider } from '@nimiq/web3-provider-nimiq'
import type { EthereumProvider } from '@trustwallet/web3-provider-ethereum'

// EIP-6963 Types
interface EIP6963ProviderInfo {
  uuid: string
  name: string
  icon: string
  rdns: string
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo
  provider: EthereumProvider
}

interface EIP6963AnnounceProviderEvent extends CustomEvent {
  detail: EIP6963ProviderDetail
}

/**
 * Window interface extension for `mobileApp` injected by InAppBrowser plugin
 */
export declare global {
  interface Window {
    mobileApp?: {
      postMessage: (message: any) => void
    }
    nimiq?: NimiqProvider
    ethereum?: EthereumProvider
    /** Nimiq RPC URL injected by the host before this script runs. */
    __NIMIQ_RPC_URL__?: string
    /** Ethereum RPC URL injected by the host before this script runs. */
    __ETH_RPC_URL__?: string
  }

  interface WindowEventMap {
    'eip6963:announceProvider': EIP6963AnnounceProviderEvent
    'eip6963:requestProvider': Event
  }
}
