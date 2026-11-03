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

/** Mirrors `Fiat` from `@nimiq/mini-app-sdk` — keep values in sync. */
type NimiqPayFiat = 'USD' | 'EUR' | 'CRC' | 'GMD'

/** Mirrors `Network` from `@nimiq/mini-app-sdk` — keep values in sync. */
type NimiqPayNetwork = 'mainnet' | 'testnet'

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
    /** Host context seeded by Nimiq Pay before the provider script runs. */
    __NIMIQ_PAY__?: { lang?: string, userFiat?: NimiqPayFiat, network?: NimiqPayNetwork }
    /** Public host APIs exposed to mini apps. */
    nimiqPay?: {
      readonly language?: string
      /** Fiat currency selected by the user in Nimiq Pay. */
      readonly userFiat?: NimiqPayFiat
      /** Nimiq network Nimiq Pay is connected to. */
      readonly network?: NimiqPayNetwork
      /** Enter native fullscreen after the Mini App has asked the user. */
      requestFullscreen: () => Promise<void>
      exitFullscreen: () => Promise<void>
      getFullscreen: () => Promise<boolean>
      onFullscreenChange: (listener: (enabled: boolean) => void) => () => void
      /**
       * Request a pseudonymous, per-origin device identifier (64-char hex SHA-256).
       * Prompts the user on first call per origin; subsequent calls auto-resolve.
       * @param options.reason - shown to the user, truncated past 200 characters
       * @throws if the user denies the prompt
       */
      requestDeviceIdentifier: (options: { reason: string }) => Promise<string>
    }
  }

  interface WindowEventMap {
    'eip6963:announceProvider': EIP6963AnnounceProviderEvent
    'eip6963:requestProvider': Event
    'nimiqPay:fullscreenChange': CustomEvent<{ enabled: boolean }>
  }
}
