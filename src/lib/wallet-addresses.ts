import { useLocalWallet } from '@/stores/local-wallet'
import { useRemoteSigner } from '@/stores/remote-signer'

/** What a Mini App gets from listAccounts. */
export function nimiqAddresses(): string[] {
  return [
    useLocalWallet().localAddress.toUserFriendlyAddress(),
    useRemoteSigner().remoteAddress?.toUserFriendlyAddress(),
  ].filter((address): address is string => !!address)
}

/** What a Mini App gets from listAccounts and eth_requestAccounts together. */
export function walletAddresses(): string[] {
  const ethAddress = useLocalWallet().getEthAddress().data
  return ethAddress ? [...nimiqAddresses(), ethAddress] : nimiqAddresses()
}
