import { Web3Provider } from '@trustwallet/web3-provider-core'
import { NimiqProvider } from '@trustwallet/web3-provider-nimiq'

const Nimiq = new NimiqProvider();

const provider = new Web3Provider({
    strategy: 'CALLBACK',
    handler: (params) => window.mobileApp?.postMessage({ detail: params }),
}).registerProvider(Nimiq)

window.addEventListener('messageFromNative', ((event: CustomEvent) => {
    // console.debug('[NimiqProvider] Received message from native:', event.detail)
    if (!event.detail.id) return
    provider.sendResponse(event.detail.id, event.detail.data)
}) as EventListener)

window.nimiq = Nimiq
