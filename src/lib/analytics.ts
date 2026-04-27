import type { PaymentMethod, Rail } from '@/types/transactions'
import { Device } from '@capacitor/device'
import { Posthog } from '@capawesome/capacitor-posthog'
import { useDecrypt } from '@/composables/useDecrypt'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { isDev } from '@/lib'
import { Asset, assetRegistry } from '@/lib/assets'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { Transfer } from '@/types/transactions'

const logger = useLogger('Analytics')

function capture(event: string, properties: object): void {
  if (isDev)
    return
  void Posthog.capture({ event, properties: properties as Record<string, unknown> })
}

export type DAppOpenSource = 'featured' | 'recent' | 'search' | 'deeplink'

export type AppOpenSource = 'cold_start' | 'resume'

export interface AppOpenedProperties {
  openSource: AppOpenSource
  hasWallet: boolean
  isUnlocked: boolean
  activeAsset?: Asset
}

export type WalletEntryMethod = 'create' | 'create_with_promo_code' | 'import'

export type FeatureName
  = | 'pay'
    | 'top_up'
    | 'withdraw'
    | 'backup'
    | 'points'
    | 'referral'
    | 'mini_apps'
    | 'verify_phone'
    | 'naka_onboarding'
    | 'naka_management'

export interface FeatureOpenedProperties {
  featureName: FeatureName
  source: string
  channel: 'flow' | 'modal'
  activeAsset?: Asset
}

export function trackAppOpened(props: AppOpenedProperties): void {
  capture('app_opened', {
    open_source: props.openSource,
    has_wallet: props.hasWallet,
    is_unlocked: props.isUnlocked,
    ...(props.activeAsset ? { active_asset: props.activeAsset } : {}),
  })
}

export function trackWalletEntrySelected(entryMethod: WalletEntryMethod): void {
  capture('wallet_entry_selected', { entry_method: entryMethod })
}

export function trackWalletCreated(props: { entryMethod: Exclude<WalletEntryMethod, 'import'>, hasReferralCode: boolean }): void {
  capture('wallet_created', {
    entry_method: props.entryMethod,
    has_referral_code: props.hasReferralCode,
  })
}

export function trackWalletImported(): void {
  capture('wallet_imported', { entry_method: 'import' })
}

export function trackFeatureOpened(props: FeatureOpenedProperties): void {
  capture('feature_opened', {
    feature_name: props.featureName,
    source: props.source,
    channel: props.channel,
    ...(props.activeAsset ? { active_asset: props.activeAsset } : {}),
  })
}

export function trackCurrentAppOpen(openSource: AppOpenSource): void {
  const isWeb = useDevice().isWeb
  trackAppOpened({
    openSource,
    hasWallet: isWeb ? useDecrypt().hasPin() : useConn().dbExists,
    isUnlocked: useDecrypt().decrypted.value,
    activeAsset: useApp().activeAsset,
  })
}

// --- Payment Analytics ---

export type AmountRange = '<1' | '1-10' | '10-100' | '100-1000' | '1000-10000' | '10000-50000' | '50000-100000' | '100000+'

export interface PaymentEventProperties {
  asset: Asset | 'Points'
  payment_method: PaymentMethod
  transfer_type: Rail | undefined
  amount_range: AmountRange
  is_atomic_swap: boolean
}

export type PaymentAnalyticsStatus = 'started' | 'completed' | 'failed' | 'cancelled'

export interface PaymentAnalyticsState {
  startedAt: number
  status: PaymentAnalyticsStatus
}

export function startPaymentAnalytics(startedAt = Date.now()): PaymentAnalyticsState {
  return { startedAt, status: 'started' }
}

export function finishPaymentAnalytics(
  state: PaymentAnalyticsState,
  status: Exclude<PaymentAnalyticsStatus, 'started'>,
): PaymentAnalyticsState {
  return { ...state, status }
}

export function buildPaymentAnalyticsProps(opts: {
  asset: Asset
  paymentMethod: PaymentMethod
  payWithPuntos: boolean
  rail: Rail | undefined
  amount: number
  transfer: Transfer | undefined
}): PaymentEventProperties {
  // Convert from smallest units (luna/wei) to human-readable coins
  const { decimals } = assetRegistry[opts.asset]
  const humanAmount = opts.amount / (10 ** decimals)
  return {
    asset: opts.payWithPuntos ? 'Points' : opts.asset,
    payment_method: opts.paymentMethod,
    transfer_type: opts.rail,
    amount_range: getAmountRange(humanAmount),
    is_atomic_swap: opts.transfer === Transfer.UserPaymentToAtomicSwap,
  }
}

export function getAmountRange(amount: number): AmountRange {
  if (amount < 1)
    return '<1'
  if (amount <= 10)
    return '1-10'
  if (amount <= 100)
    return '10-100'
  if (amount <= 1000)
    return '100-1000'
  if (amount <= 10000)
    return '1000-10000'
  if (amount <= 50000)
    return '10000-50000'
  if (amount <= 100000)
    return '50000-100000'
  return '100000+'
}

export function trackPaymentStarted(props: PaymentEventProperties): void {
  capture('payment_started', props)
}

export function trackPaymentCompleted(props: PaymentEventProperties & { duration_ms: number }): void {
  capture('payment_completed', props)
}

export function trackPaymentFailed(props: PaymentEventProperties & { error_reason: string }): void {
  capture('payment_failed', props)
}

export function trackPaymentCancelled(props: PaymentEventProperties & { cancelled_at_step: 'pin' }): void {
  capture('payment_cancelled', props)
}

const SWAP_PROVIDER = 'fastspot' as const

function assetToSwapPair(asset: Asset): string {
  return asset === Asset.USDT ? 'USDT_BTC_LN' : 'NIM_BTC_LN'
}

export function trackSwapCompleted(props: { swap_duration_ms: number, asset: Asset }): void {
  capture('swap_completed', { ...props, swap_pair: assetToSwapPair(props.asset), swap_provider: SWAP_PROVIDER })
}

export function trackSwapFailed(props: { error_reason: string, asset: Asset }): void {
  capture('swap_failed', { ...props, swap_pair: assetToSwapPair(props.asset), swap_provider: SWAP_PROVIDER })
}

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
  capture('miniapp_opened', { dapp_url: url, dapp_name: name, source })
}

export function trackDAppClosed(url: string, name: string, durationMs: number): void {
  capture('miniapp_closed', { dapp_url: url, dapp_name: name, session_duration_ms: durationMs })
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
  capture('miniapp_web3_request', {
    request_type: opts.requestType,
    blockchain: opts.blockchain,
    dapp_url: opts.dappUrl,
    dapp_name: opts.dappName,
    approved: opts.approved,
    success: opts.success,
    ...(opts.chainId ? { chain_id: opts.chainId } : {}),
  })
}

export function trackChainSwitched(dappUrl: string, fromChainId: string, toChainId: string): void {
  capture('miniapp_chain_switched', { dapp_url: dappUrl, from_chain_id: fromChainId, to_chain_id: toChainId })
}

export async function identifyUser() {
  try {
    const { identifier } = await Device.getId()
    Posthog.identify({ distinctId: identifier, userProperties: { isDev } })
  }
  catch (error) {
    logger.error('Failed to identify user in Posthog', error)
  }
}
