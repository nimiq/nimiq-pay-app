import type { UserConfirmationRequest } from '@/composables/useMiniAppHost'
import { ExtendedDialog } from 'capacitor-extended-dialog'
import { formatEther } from 'ethers'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { getFaviconUrl } from '@/lib/site-metadata'
import { Crypto } from '@/stores/app'
import { useLocalWallet } from '@/stores/local-wallet'
import { useMiniApps } from '@/stores/mini-apps'
import { STAKING_CONTRACT_ADDRESS } from '@/stores/nimiq-network'

const logger = useLogger('mini-app-confirmation')

function resolveMiniAppLogo(url: string): string {
  return useMiniApps().iconForUrl(url) ?? getFaviconUrl(url)
}

/**
 * Request user confirmation for sensitive mini-app operations.
 * Extracted from MiniAppsModal so it can be reused during session reconnection.
 */
export async function requestUserConfirmation(request: UserConfirmationRequest): Promise<boolean> {
  switch (request.type) {
    case 'accounts': {
      const appName = request.name || new URL(request.url).hostname
      let truncatedAddress = ''
      if (request.network === 'ethereum') {
        const ethAddress = useLocalWallet().getEthAddress().data
        truncatedAddress = ethAddress ? `${ethAddress.slice(0, 6)}\u2026${ethAddress.slice(-4)}` : ''
      }
      if (request.network === 'nimiq') {
        const nimAddress = useLocalWallet().localAddress.toUserFriendlyAddress()
        truncatedAddress = `${nimAddress.slice(0, 4)}\u2026${nimAddress.slice(-4)}`
      }

      const result = await ExtendedDialog.sheet({
        title: `Connect to ${appName}`,
        subtitle: `${appName} will be able to:`,
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows: [
          { title: `• See your address ${truncatedAddress}` },
          { title: '• View your balance and activity' },
          { title: '• Request approval for transactions' },
        ],
        confirmButtonTitle: 'Connect',
        cancelButtonTitle: 'Cancel',
      })
      return result.confirmed
    }

    case 'transaction': {
      const { recipient, amount, fee, message } = request.data

      const { formatCrypto } = useCurrencyFormatter()
      const amountNim = formatCrypto(amount, { currency: Crypto.NIM })
      const feeNim = formatCrypto(fee, { currency: Crypto.NIM })

      const formattedRecipient = recipient === STAKING_CONTRACT_ADDRESS
        ? 'Staking Contract'
        : recipient === useLocalWallet().localAddress.toUserFriendlyAddress()
          ? 'You'
          : `${recipient.slice(0, 4)}\u2026${recipient.slice(-4)}`

      const rows: { title: string, value?: string }[] = [
        { title: 'Recipient', value: formattedRecipient },
        { title: 'Amount', value: `${amountNim}` },
      ]
      if (fee)
        rows.push({ title: 'Fee', value: `${feeNim}` })
      if (message)
        rows.push({ title: 'Message', value: message })

      if (request.stakingData) {
        rows.push({ title: '' })
        rows.push({ title: 'STAKING' })
        switch (request.stakingData.type) {
          case 'create-staker': {
            rows.push({ title: 'Action', value: i18n.t('Create Staker') })
            rows.push({ title: 'Validator', value: request.stakingData.delegation })
            break
          }
          case 'add-stake': {
            rows.push({ title: 'Action', value: i18n.t('Add Stake') })
            break
          }
          case 'set-active-stake': {
            rows.push({ title: 'Action', value: i18n.t('Set Active Stake') })
            rows.push({ title: 'New Active Stake', value: formatCrypto(request.stakingData.newActiveBalance, { currency: Crypto.NIM }) })
            break
          }
          case 'update-staker': {
            rows.push({ title: 'Action', value: i18n.t('Update Staker') })
            if (request.stakingData.newDelegation) {
              rows.push({ title: 'New Validator', value: request.stakingData.newDelegation })
              rows.push({ title: 'Reactivate?', value: request.stakingData.reactivateAllStake ? i18n.t('Yes') : i18n.t('No') })
            }
            break
          }
          case 'retire-stake': {
            rows.push({ title: 'Action', value: i18n.t('Retire Stake') })
            rows.push({ title: 'Amount', value: formatCrypto(request.stakingData.retireStake, { currency: Crypto.NIM }) })
            break
          }
          case 'remove-stake': {
            rows.push({ title: 'Action', value: i18n.t('Remove Stake') })
            break
          }
        }
      }

      if (request.htlcData) {
        switch (request.htlcData.type) {
          case 'new-htlc': {
            rows.push({ title: 'Action', value: i18n.t('New HTLC') })
            rows.push({ title: 'HTLC Sender', value: request.htlcData.sender.toUserFriendlyAddress() })
            rows.push({ title: 'HTLC Recipient', value: request.htlcData.recipient.toUserFriendlyAddress() })
            rows.push({ title: 'Hash Root', value: Nimiq.BufferUtils.toHex(request.htlcData.hashRoot) })
            rows.push({ title: 'Hash Count', value: request.htlcData.hashCount.toString(10) })
            rows.push({ title: 'Timeout', value: new Date(request.htlcData.timeout).toLocaleString() })
            break
          }
          case 'redeem-regular': {
            rows.push({ title: 'Action', value: i18n.t('Redeem HTLC (regular)') })
            rows.push({ title: 'Hash Root', value: Nimiq.BufferUtils.toHex(request.htlcData.hashRoot) })
            rows.push({ title: 'Pre Image', value: Nimiq.BufferUtils.toHex(request.htlcData.preImage) })
            rows.push({ title: 'Hash Count', value: request.htlcData.hashCount.toString(10) })
            break
          }
          case 'redeem-timeout': {
            rows.push({ title: 'Action', value: i18n.t('Redeem HTLC (timeout)') })
            break
          }
          case 'redeem-early': {
            rows.push({ title: 'Action', value: i18n.t('Redeem HTLC (early)') })
            rows.push({ title: 'Sender Signature', value: Nimiq.BufferUtils.toHex(request.htlcData.senderSignatureProof.serialize()) })
            rows.push({ title: 'Recipient Signature', value: Nimiq.BufferUtils.toHex(request.htlcData.recipientSignatureProof.serialize()) })
            break
          }
        }
      }

      const appName = request.name || new URL(request.url).hostname
      const result = await ExtendedDialog.sheet({
        title: 'Confirm Transaction',
        subtitle: `${appName} asks to send this transaction:`,
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows,
        confirmButtonTitle: 'Confirm',
        cancelButtonTitle: 'Reject',
      })
      return result.confirmed
    }

    case 'eth-transaction': {
      const txParams = request.data as {
        to: string
        from: string
        value?: string
        data?: string
        gas?: string
        maxFeePerGas?: string
        maxPriorityFeePerGas?: string
        gasPrice?: string
        nonce?: number
        chainId?: string
        chainName?: string
        decodedAssetTransfer?: {
          assetSymbol: string
          network: string
          recipient: string
          amount: string
        }
      }
      const valueEth = formatEther(BigInt(txParams.value || '0x0'))
      const gasLimit = txParams.gas ? Number.parseInt(txParams.gas, 16) : 0
      const nativeAssetSymbol = txParams.chainName === 'Polygon' || txParams.chainId === `0x${polygonUsdtConfig.networkId.toString(16)}` ? 'MATIC' : 'ETH'

      // Convert wei hex to Gwei for readable gas prices
      const toGwei = (hex?: string) => {
        if (!hex)
          return null
        const wei = BigInt(hex)
        // 1 Gwei = 1e9 wei. Show up to 2 decimals.
        const gwei = Number(wei) / 1e9
        return `${gwei.toFixed(2)} Gwei`
      }

      // Estimate max total fee: gasLimit * maxFeePerGas (or gasPrice)
      const feePerGasHex = txParams.maxFeePerGas || txParams.gasPrice
      const maxTotalFee = feePerGasHex && gasLimit
        ? formatEther(BigInt(feePerGasHex) * BigInt(gasLimit))
        : null

      const rows: { title: string, value: string }[] = []

      if (txParams.decodedAssetTransfer) {
        rows.push(
          { title: 'Network', value: txParams.decodedAssetTransfer.network },
          { title: 'Asset', value: txParams.decodedAssetTransfer.assetSymbol },
          { title: 'Recipient', value: txParams.decodedAssetTransfer.recipient },
          { title: 'Amount', value: txParams.decodedAssetTransfer.amount },
          { title: 'Contract', value: txParams.to },
          { title: 'Gas Limit', value: String(gasLimit) },
        )
      }
      else {
        if (txParams.chainName)
          rows.push({ title: 'Network', value: txParams.chainName })

        rows.push(
          { title: 'To', value: txParams.to },
          { title: 'Value', value: `${valueEth} ${nativeAssetSymbol}` },
          { title: 'Gas Limit', value: String(gasLimit) },
        )
      }

      if (txParams.maxFeePerGas) {
        const gwei = toGwei(txParams.maxFeePerGas)
        if (gwei)
          rows.push({ title: 'Max Fee', value: gwei })
      }
      if (txParams.maxPriorityFeePerGas) {
        const gwei = toGwei(txParams.maxPriorityFeePerGas)
        if (gwei)
          rows.push({ title: 'Priority Fee', value: gwei })
      }
      if (txParams.gasPrice && !txParams.maxFeePerGas) {
        const gwei = toGwei(txParams.gasPrice)
        if (gwei)
          rows.push({ title: 'Gas Price', value: gwei })
      }
      if (maxTotalFee)
        rows.push({ title: 'Max Total Fee', value: `${maxTotalFee} ${nativeAssetSymbol}` })
      if (txParams.nonce !== undefined)
        rows.push({ title: 'Nonce', value: String(txParams.nonce) })
      if (!txParams.decodedAssetTransfer && txParams.data && txParams.data !== '0x')
        rows.push({ title: 'Contract Interaction', value: 'Yes' })

      const result = await ExtendedDialog.sheet({
        title: `Confirm Transaction`,
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows,
        confirmButtonTitle: 'Confirm',
        cancelButtonTitle: 'Reject',
      })
      return result.confirmed
    }

    case 'message': {
      const appName = request.name || new URL(request.url).hostname
      const { message: msgToSign, isHex } = request.data
      const displayMessage = isHex
        ? `Hex data: ${msgToSign.slice(0, 50)}${msgToSign.length > 50 ? '...' : ''}`
        : msgToSign

      const result = await ExtendedDialog.messageSheet({
        title: 'Sign Message',
        subtitle: `${appName} asks to sign this message:`,
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        message: displayMessage,
        confirmButtonTitle: 'Sign',
        cancelButtonTitle: 'Reject',
      })
      return result.confirmed
    }

    case 'chain': {
      const appName = request.name || new URL(request.url).hostname
      const { action, chainId, chainName, rpcUrl } = request.data
      let rpcHost: string | undefined
      if (rpcUrl) {
        try {
          rpcHost = new URL(rpcUrl).host
        }
        catch {
          rpcHost = rpcUrl
        }
      }

      const rows: { title: string, value: string }[] = [
        { title: 'Action', value: action === 'add' ? 'Add Network' : 'Switch Network' },
        { title: 'Network', value: chainName || chainId },
        { title: 'Chain ID', value: chainId },
      ]

      if (rpcHost)
        rows.push({ title: 'RPC Host', value: rpcHost })

      const result = await ExtendedDialog.sheet({
        title: action === 'add' ? 'Add Network' : 'Switch Network',
        subtitle: `${appName} wants to ${action === 'add' ? 'add and switch to' : 'switch to'} this network:`,
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows,
        confirmButtonTitle: action === 'add' ? 'Approve Network' : 'Switch Network',
        cancelButtonTitle: 'Cancel',
      })
      return result.confirmed
    }

    case 'deviceIdentifier': {
      const appName = request.name || new URL(request.url).hostname
      const result = await ExtendedDialog.sheet({
        title: `Share device ID with ${appName}?`,
        subtitle: 'Unique to this Mini App on this device. Cannot be used to track you across other Mini Apps.',
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows: [
          { title: 'Reason', value: request.reason },
        ],
        confirmButtonTitle: 'Share',
        cancelButtonTitle: 'Deny',
      })
      return result.confirmed
    }

    default:
      logger.error('Unknown confirmation request type:', request)
      return false
  }
}
