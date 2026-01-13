import type { NimiqProvider } from "@trustwallet/web3-provider-nimiq"

/**
 * Window interface extension for `mobileApp` injected by InAppBrowser plugin
 */
export declare global {
    interface Window {
        mobileApp?: {
            postMessage: (message: any) => void
        }
        nimiq?: NimiqProvider
    }
}
