import type { UserConfirmationRequest } from '@/composables/useMiniAppHost'
import { ExtendedDialog } from 'capacitor-extended-dialog'
import { formatEther } from 'ethers'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useLogger } from '@/composables/useLogger'
import { MINI_APP_REQUEST_TIMEOUT_MS } from '@/composables/useMiniAppHost'
import { i18n } from '@/i18n/i18n-setup'
import { Asset } from '@/lib/assets'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { getFaviconUrl } from '@/lib/site-metadata'
import { Crypto, DECIMALS } from '@/stores/app'
import { useLocalWallet } from '@/stores/local-wallet'
import { useMiniApps } from '@/stores/mini-apps'
import { STAKING_CONTRACT_ADDRESS } from '@/stores/nimiq-network'

const logger = useLogger('mini-app-confirmation')

function resolveMiniAppLogo(url: string): string {
  return useMiniApps().iconForUrl(url) ?? getFaviconUrl(url)
}

export async function selectLightningAsset(app: { url: string, name: string, description?: string }, deadline = Date.now() + MINI_APP_REQUEST_TIMEOUT_MS): Promise<Asset | undefined> {
  const timeout = deadline - Date.now()
  if (timeout <= 0)
    return undefined
  const result = await ExtendedDialog.singleSelect({
    title: i18n.t('Pay Bitcoin Lightning'),
    message: app.description
      ? i18n.t('{appName} requests a Lightning payment for {description}. Choose what to spend.', { appName: app.name, description: app.description })
      : i18n.t('{appName} requests a Lightning payment. Choose what to spend.', { appName: app.name }),
    options: [
      { label: 'NIM', value: Asset.NIM },
      { label: i18n.t('USDT on Polygon'), value: Asset.USDT },
    ],
    okButtonTitle: i18n.t('Continue'),
    cancelButtonTitle: i18n.t('Cancel'),
    timeout,
  })
  return result.value === Asset.NIM || result.value === Asset.USDT ? result.value : undefined
}

export async function requestUserConfirmation(request: UserConfirmationRequest, deadline = Date.now() + MINI_APP_REQUEST_TIMEOUT_MS): Promise<boolean> {
  const timeout = deadline - Date.now()
  if (timeout <= 0)
    return false
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
        title: i18n.t('Connect to {appName}', { appName }),
        subtitle: i18n.t('{appName} will be able to:', { appName }),
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows: [
          { title: `• ${i18n.t('See your address {address}', { address: truncatedAddress })}` },
          { title: `• ${i18n.t('View your balance and activity')}` },
          { title: `• ${i18n.t('Request approval for transactions')}` },
        ],
        confirmButtonTitle: i18n.t('Connect'),
        cancelButtonTitle: i18n.t('Cancel'),
        timeout,
      })
      return result.confirmed
    }

    case 'transaction': {
      const { recipient, amount, fee, message } = request.data

      const { formatCrypto } = useCurrencyFormatter()
      const amountNim = formatCrypto(amount, { currency: Crypto.NIM })
      // Fees are often below 0.01 NIM, so show what gets signed instead of rounding to 0
      const feeNim = formatCrypto(fee, { currency: Crypto.NIM, maxDecimals: DECIMALS[Crypto.NIM] })

      const formattedRecipient = recipient === STAKING_CONTRACT_ADDRESS
        ? i18n.t('Staking Contract')
        : recipient === useLocalWallet().localAddress.toUserFriendlyAddress()
          ? i18n.t('You')
          : `${recipient.slice(0, 4)}\u2026${recipient.slice(-4)}`

      const rows: { title: string, value?: string }[] = [
        { title: i18n.t('Recipient'), value: formattedRecipient },
        { title: i18n.t('Amount'), value: `${amountNim}` },
      ]
      if (fee)
        rows.push({ title: i18n.t('Fee'), value: `${feeNim}` })
      if (message)
        rows.push({ title: i18n.t('Message'), value: message })

      if (request.stakingData) {
        rows.push({ title: '' })
        rows.push({ title: i18n.t('STAKING') })
        switch (request.stakingData.type) {
          case 'create-staker': {
            rows.push({ title: i18n.t('Action'), value: i18n.t('Create Staker') })
            rows.push({ title: i18n.t('Validator'), value: request.stakingData.delegation })
            break
          }
          case 'add-stake': {
            rows.push({ title: i18n.t('Action'), value: i18n.t('Add Stake') })
            break
          }
          case 'set-active-stake': {
            rows.push({ title: i18n.t('Action'), value: i18n.t('Set Active Stake') })
            rows.push({ title: i18n.t('New Active Stake'), value: formatCrypto(request.stakingData.newActiveBalance, { currency: Crypto.NIM }) })
            break
          }
          case 'update-staker': {
            rows.push({ title: i18n.t('Action'), value: i18n.t('Update Staker') })
            if (request.stakingData.newDelegation) {
              rows.push({ title: i18n.t('New Validator'), value: request.stakingData.newDelegation })
              rows.push({ title: i18n.t('Reactivate?'), value: request.stakingData.reactivateAllStake ? i18n.t('Yes') : i18n.t('No') })
            }
            break
          }
          case 'retire-stake': {
            rows.push({ title: i18n.t('Action'), value: i18n.t('Retire Stake') })
            rows.push({ title: i18n.t('Amount'), value: formatCrypto(request.stakingData.retireStake, { currency: Crypto.NIM }) })
            break
          }
          case 'remove-stake': {
            rows.push({ title: i18n.t('Action'), value: i18n.t('Remove Stake') })
            break
          }
        }
      }

      const appName = request.name || new URL(request.url).hostname
      const result = await ExtendedDialog.sheet({
        title: i18n.t('Confirm Transaction'),
        subtitle: i18n.t('{appName} asks to send this transaction:', { appName }),
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows,
        confirmButtonTitle: i18n.t('Confirm'),
        cancelButtonTitle: i18n.t('Reject'),
        timeout,
      })
      return result.confirmed
    }

    case 'lightning-access': {
      const appName = request.name || new URL(request.url).hostname
      const result = await ExtendedDialog.sheet({
        title: i18n.t('Review Lightning payment'),
        subtitle: i18n.t('{appName} wants to prepare payments and check Lightning invoice history for this wallet during this session.', { appName }),
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows: request.description ? [{ title: i18n.t('Invoice'), value: request.description }] : [],
        confirmButtonTitle: i18n.t('Continue'),
        cancelButtonTitle: i18n.t('Cancel'),
        timeout,
      })
      return result.confirmed
    }

    case 'lightning-payment': {
      const appName = request.name || new URL(request.url).hostname
      const { description, btcAmount, asset, amount, usdtFeeAllowance, fees } = request.data
      const formatAmount = (value: number, maxDigits: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDigits }).format(value)
      const rows: { title: string, value?: string }[] = [
        { title: i18n.t('Lightning payment'), value: description || i18n.t('Bitcoin merchant') },
        { title: i18n.t('Merchant receives'), value: `${formatAmount(btcAmount, 11)} BTC` },
        { title: i18n.t('You spend'), value: `${formatAmount((amount + usdtFeeAllowance) / 10 ** DECIMALS[asset], DECIMALS[asset])} ${asset}` },
      ]
      if (asset === Asset.USDT)
        rows.push({ title: i18n.t('USDT fee allowance'), value: `${formatAmount(usdtFeeAllowance / 10 ** DECIMALS[Crypto.USDT], DECIMALS[Crypto.USDT])} USDT` })
      for (const fee of fees) {
        if (fee.asset !== Crypto.NIM && fee.asset !== Crypto.BTC && fee.asset !== Crypto.USDT && fee.asset !== 'USD')
          continue
        if (asset === Asset.USDT && fee.asset === Crypto.USDT && !fee.included)
          continue
        const amount = fee.asset === 'USD' ? fee.amount.toFixed(2) : (fee.amount / 10 ** DECIMALS[fee.asset]).toFixed(DECIMALS[fee.asset])
        rows.push({
          title: fee.source === 'SERVICE'
            ? fee.included ? i18n.t('Service fee (included)') : i18n.t('Service fee')
            : fee.included ? i18n.t('Network fee (included)') : i18n.t('Network fee'),
          value: `${amount} ${fee.asset}`,
        })
      }
      const result = await ExtendedDialog.sheet({
        title: i18n.t('Pay Bitcoin Lightning'),
        subtitle: i18n.t('{appName} requests this payment:', { appName }),
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows,
        confirmButtonTitle: i18n.t('Pay with {asset}', { asset }),
        cancelButtonTitle: i18n.t('Reject'),
        timeout,
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

      const toGwei = (hex?: string) => {
        if (!hex)
          return null
        const wei = BigInt(hex)
        const gwei = Number(wei) / 1e9
        return `${gwei.toFixed(2)} Gwei`
      }

      const feePerGasHex = txParams.maxFeePerGas || txParams.gasPrice
      const maxTotalFee = feePerGasHex && gasLimit
        ? formatEther(BigInt(feePerGasHex) * BigInt(gasLimit))
        : null

      const rows: { title: string, value: string }[] = []

      if (txParams.decodedAssetTransfer) {
        rows.push(
          { title: i18n.t('Network'), value: txParams.decodedAssetTransfer.network },
          { title: i18n.t('Asset'), value: txParams.decodedAssetTransfer.assetSymbol },
          { title: i18n.t('Recipient'), value: txParams.decodedAssetTransfer.recipient },
          { title: i18n.t('Amount'), value: txParams.decodedAssetTransfer.amount },
          { title: i18n.t('Contract'), value: txParams.to },
          { title: i18n.t('Gas Limit'), value: String(gasLimit) },
        )
      }
      else {
        if (txParams.chainName)
          rows.push({ title: i18n.t('Network'), value: txParams.chainName })

        rows.push(
          { title: i18n.t('To'), value: txParams.to },
          { title: i18n.t('Value'), value: `${valueEth} ${nativeAssetSymbol}` },
          { title: i18n.t('Gas Limit'), value: String(gasLimit) },
        )
      }

      if (txParams.maxFeePerGas) {
        const gwei = toGwei(txParams.maxFeePerGas)
        if (gwei)
          rows.push({ title: i18n.t('Max Fee'), value: gwei })
      }
      if (txParams.maxPriorityFeePerGas) {
        const gwei = toGwei(txParams.maxPriorityFeePerGas)
        if (gwei)
          rows.push({ title: i18n.t('Priority Fee'), value: gwei })
      }
      if (txParams.gasPrice && !txParams.maxFeePerGas) {
        const gwei = toGwei(txParams.gasPrice)
        if (gwei)
          rows.push({ title: i18n.t('Gas Price'), value: gwei })
      }
      if (maxTotalFee)
        rows.push({ title: i18n.t('Max Total Fee'), value: `${maxTotalFee} ${nativeAssetSymbol}` })
      if (txParams.nonce !== undefined)
        rows.push({ title: i18n.t('Nonce'), value: String(txParams.nonce) })
      if (!txParams.decodedAssetTransfer && txParams.data && txParams.data !== '0x')
        rows.push({ title: i18n.t('Contract Interaction'), value: i18n.t('Yes') })

      const result = await ExtendedDialog.sheet({
        title: i18n.t('Confirm Transaction'),
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows,
        confirmButtonTitle: i18n.t('Confirm'),
        cancelButtonTitle: i18n.t('Reject'),
        timeout,
      })
      return result.confirmed
    }

    case 'message': {
      const appName = request.name || new URL(request.url).hostname
      const { message: msgToSign, isHex } = request.data
      const displayMessage = isHex
        ? i18n.t('Hex data: {data}', { data: `${msgToSign.slice(0, 50)}${msgToSign.length > 50 ? '...' : ''}` })
        : msgToSign

      const result = await ExtendedDialog.messageSheet({
        title: i18n.t('Sign Message'),
        subtitle: i18n.t('{appName} asks to sign this message:', { appName }),
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        message: displayMessage,
        confirmButtonTitle: i18n.t('Sign'),
        cancelButtonTitle: i18n.t('Reject'),
        timeout,
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
        { title: i18n.t('Action'), value: action === 'add' ? i18n.t('Add Network') : i18n.t('Switch Network') },
        { title: i18n.t('Network'), value: chainName || chainId },
        { title: i18n.t('Chain ID'), value: chainId },
      ]

      if (rpcHost)
        rows.push({ title: i18n.t('RPC Host'), value: rpcHost })

      const result = await ExtendedDialog.sheet({
        title: action === 'add' ? i18n.t('Add Network') : i18n.t('Switch Network'),
        subtitle: action === 'add'
          ? i18n.t('{appName} wants to add and switch to this network:', { appName })
          : i18n.t('{appName} wants to switch to this network:', { appName }),
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows,
        confirmButtonTitle: action === 'add' ? i18n.t('Approve Network') : i18n.t('Switch Network'),
        cancelButtonTitle: i18n.t('Cancel'),
        timeout,
      })
      return result.confirmed
    }

    case 'deviceIdentifier': {
      const appName = request.name || new URL(request.url).hostname
      const result = await ExtendedDialog.sheet({
        title: i18n.t('Share device ID with {appName}?', { appName }),
        subtitle: i18n.t('Unique to this Mini App on this device. Cannot be used to track you across other Mini Apps.'),
        headerLogo: resolveMiniAppLogo(request.url),
        headerLogoCornerRadius: -1,
        rows: [
          { title: i18n.t('Reason'), value: request.reason.length > 200 ? `${request.reason.slice(0, 197)}...` : request.reason },
        ],
        confirmButtonTitle: i18n.t('Share'),
        cancelButtonTitle: i18n.t('Deny'),
        timeout,
      })
      return result.confirmed
    }

    default:
      logger.error('Unknown confirmation request type:', request)
      return false
  }
}
