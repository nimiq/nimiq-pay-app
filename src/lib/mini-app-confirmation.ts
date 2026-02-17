import type { UserConfirmationRequest } from '@/composables/useMiniAppHost'
import { ExtendedDialog } from 'capacitor-extended-dialog'
import { formatEther } from 'ethers'
import { useLogger } from '@/composables/useLogger'
import { getFaviconUrl } from '@/lib/site-metadata'
import { useLocalWallet } from '@/stores/local-wallet'

const logger = useLogger('mini-app-confirmation')

/**
 * Request user confirmation for sensitive mini-app operations.
 * Extracted from MiniAppsModal so it can be reused during session reconnection.
 */
export async function requestUserConfirmation(request: UserConfirmationRequest): Promise<boolean> {
  switch (request.type) {
    case 'accounts': {
      const appName = request.name || new URL(request.url).hostname
      const { data: ethAddr } = useLocalWallet().getEthAddress()
      const truncatedAddress = ethAddr
        ? `${ethAddr.slice(0, 6)}\u2026${ethAddr.slice(-4)}`
        : ''

      const result = await ExtendedDialog.sheet({
        title: `Connect to ${appName}`,
        subtitle: `${appName} will be able to:`,
        headerLogo: getFaviconUrl(request.url),
        headerLogoCornerRadius: -1,
        rows: [
          { title: `See your address ${truncatedAddress}` },
          { title: 'View your balance and activity' },
          { title: 'Request approval for transactions' },
        ],
        confirmButtonTitle: 'Connect',
        cancelButtonTitle: 'Cancel',
      })
      return result.confirmed
    }

    case 'transaction': {
      const { recipient, amount, fee, message, merchantName } = request.data
      const amountNim = (amount / 1e5).toFixed(5)
      const feeNim = fee ? (fee / 1e5).toFixed(5) : '0'

      const rows: { title: string, value: string }[] = [
        { title: 'Recipient', value: recipient },
        { title: 'Amount', value: `${amountNim} NIM` },
      ]
      if (fee)
        rows.push({ title: 'Fee', value: `${feeNim} NIM` })
      if (message)
        rows.push({ title: 'Message', value: message })
      if (merchantName)
        rows.push({ title: 'Merchant', value: merchantName })

      const result = await ExtendedDialog.sheet({
        title: 'Confirm Transaction',
        rows,
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
      }
      const valueEth = formatEther(BigInt(txParams.value || '0x0'))
      const gasLimit = txParams.gas ? Number.parseInt(txParams.gas, 16) : 0

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

      const rows: { title: string, value: string }[] = [
        { title: 'To', value: txParams.to },
        { title: 'Value', value: `${valueEth} ETH` },
        { title: 'Gas Limit', value: String(gasLimit) },
      ]

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
        rows.push({ title: 'Max Total Fee', value: `${maxTotalFee} ETH` })
      if (txParams.nonce !== undefined)
        rows.push({ title: 'Nonce', value: String(txParams.nonce) })
      if (txParams.data && txParams.data !== '0x')
        rows.push({ title: 'Contract Interaction', value: 'Yes' })

      const result = await ExtendedDialog.sheet({
        title: `Confirm ETH Transaction`,
        headerLogo: getFaviconUrl(request.url),
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
        title: `Sign message from ${appName}`,
        headerLogo: getFaviconUrl(request.url),
        headerLogoCornerRadius: -1,
        message: displayMessage,
        confirmButtonTitle: 'Sign',
        cancelButtonTitle: 'Reject',
      })
      return result.confirmed
    }

    default:
      logger.error('Unknown confirmation request type:', request)
      return false
  }
}
