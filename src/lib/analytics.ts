import type { PaymentMethod, Rail, UserReceiptTransaction } from '@/types/transactions'
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

// Report a critical "should-not-happen" error to PostHog. Use only for genuine
// invariant violations, not everyday failures. Not isDev-gated: dev reports are
// filterable via the isDev person-property set in identifyUser().
export function reportCriticalError(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error))
  void Posthog.captureException({
    message: err.message,
    name: err.name,
    properties: { ...context, stack: err.stack },
  })
}

export type DAppOpenSource = 'featured' | 'recent' | 'search' | 'deeplink' | 'competition'

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

// Incoming deposit ("Top-Up"). Callers must only invoke this for genuinely-new deposits and
// never for our own HTLC claims (NIM: excluded by the isOwnHtlcDrain guard; USDT: excluded by
// the htlcContract-sender check). currentBalance is in the asset's smallest units.
export function trackTopUpReceived(receipt: UserReceiptTransaction, currentBalance: number): void {
  const asset = receipt.asset || Asset.NIM
  const { decimals } = assetRegistry[asset]
  capture('top_up_received', {
    asset,
    amount_range: getAmountRange(receipt.amount / 10 ** decimals),
    balance_range: getAmountRange(currentBalance / 10 ** decimals),
  })
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

export function trackConsensusEstablished(props: { duration_ms: number, network: string, sync_mode: string }): void {
  capture('consensus_established', props)
}

export function trackSwapFailed(props: { error_reason: string, asset: Asset }): void {
  capture('swap_failed', { ...props, swap_pair: assetToSwapPair(props.asset), swap_provider: SWAP_PROVIDER })
}

// Why handleFunds (or the send right after it) left local funds unsecured.
export type FundsBlockReason
  = | 'pending_tx'
    | 'remote_balance_error'
    | 'history_check_hold'
    | 'history_check_error'
    | 'deposit_busy'
    | 'deposit_failed'
    | 'nodes_not_synced'
    | 'htlc_expired'
    | 'liquidation_busy'
    | 'liquidation_failed'
    | 'htlc_not_ready'
    | 'activation_failed'

const reportedFundsBlocks = new Set<FundsBlockReason>()

// handleFunds runs on every head, so a lasting block would repeat each second; once per reason per session.
export function trackFundsBlocked(reason: FundsBlockReason, props: Record<string, unknown> = {}): void {
  if (reportedFundsBlocks.has(reason))
    return
  reportedFundsBlocks.add(reason)
  capture('funds_blocked', { reason, ...props })
}

export interface FundsProcessingProperties {
  duration_ms: number
  last_block_reason?: FundsBlockReason
  is_htlc_active: boolean
  is_remote_ok: boolean
  is_processing_remote: boolean
  is_transaction_pending: boolean
  has_pending_htlc_creation: boolean
  has_local_balance: boolean
  has_remote_balance: boolean
  htlc_history_checked: boolean
  consensus: string
  pending_htlc_creation_hashes: string[]
}

export function trackFundsProcessingStuck(props: FundsProcessingProperties): void {
  capture('funds_processing_stuck', props)
}

export function trackFundsProcessingResolved(props: FundsProcessingProperties): void {
  capture('funds_processing_resolved', props)
}

export function trackSyncSlow(props: { stage: 'remote_signer_verification', duration_ms: number, finished: boolean, discovery_complete?: boolean, error_count?: number }): void {
  capture('sync_slow', props)
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
    | 'request_device_identifier'

export function trackDAppOpened(url: string, name: string, source: DAppOpenSource): void {
  capture('miniapp_opened', { dapp_url: url, dapp_name: name, source })
}

export function trackDAppClosed(url: string, name: string, durationMs: number): void {
  capture('miniapp_closed', { dapp_url: url, dapp_name: name, session_duration_ms: durationMs })
}

export function trackWeb3Request(opts: {
  requestType: Web3RequestType
  blockchain: 'ethereum' | 'nimiq' | 'host'
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
