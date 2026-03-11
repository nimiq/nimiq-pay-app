import { Posthog } from '@capawesome/capacitor-posthog'
import { isDev } from '@/lib'

export type DAppOpenSource = 'featured' | 'recent' | 'search'

export type Web3RequestType
  = | 'request_accounts'
    | 'sign_message'
    | 'sign_typed_data'
    | 'sign_transaction'
    | 'switch_chain'
    | 'add_chain'
    | 'nimiq_list_accounts'
    | 'nimiq_sign'
    | 'nimiq_send_transaction'
    | `nimiq_staking_${string}`

export function trackDAppOpened(url: string, name: string, source: DAppOpenSource): void {
  if (isDev)
    return
  void Posthog.capture({ event: 'miniapp_opened', properties: { dapp_url: url, dapp_name: name, source } })
}

export function trackDAppClosed(url: string, name: string, durationMs: number): void {
  if (isDev)
    return
  void Posthog.capture({ event: 'miniapp_closed', properties: { dapp_url: url, dapp_name: name, session_duration_ms: durationMs } })
}

export function trackWeb3Request(opts: {
  requestType: Web3RequestType
  blockchain: 'ethereum' | 'nimiq'
  dappUrl: string
  dappName: string
  approved: boolean
  success: boolean
  chainId?: string
}): void {
  if (isDev)
    return
  void Posthog.capture({
    event: 'miniapp_web3_request',
    properties: {
      request_type: opts.requestType,
      blockchain: opts.blockchain,
      dapp_url: opts.dappUrl,
      dapp_name: opts.dappName,
      approved: opts.approved,
      success: opts.success,
      ...(opts.chainId ? { chain_id: opts.chainId } : {}),
    },
  })
}

export function trackChainSwitched(dappUrl: string, fromChainId: string, toChainId: string): void {
  if (isDev)
    return
  void Posthog.capture({
    event: 'miniapp_chain_switched',
    properties: { dapp_url: dappUrl, from_chain_id: fromChainId, to_chain_id: toChainId },
  })
}
