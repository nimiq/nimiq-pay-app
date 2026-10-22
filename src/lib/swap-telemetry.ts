import type { SwapStep, SwapStepEvent, SwapStepProps } from '@/lib/analytics'
import type { Asset } from '@/lib/assets'
import { useLogger } from '@/composables/useLogger'
import { trackSwapStep } from '@/lib/analytics'

const logger = useLogger('swap-telemetry.ts')
const SWAP_SETTLEMENT_SLOW_MS = 60_000

export interface SwapTelemetryContext {
  asset: Asset
  swap_id?: string
}

type StepProps<S extends SwapStep> = Partial<SwapStepProps[S]> & { swap_id?: string }

export function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Times one swap step and reports it once: a catch that runs after the step already ended does not report it again.
export function startSwapStep<S extends SwapStep>(step: S, context: SwapTelemetryContext, startProps?: StepProps<S>, startedAt = Date.now()) {
  let reported = false
  function report(ok: boolean, props?: StepProps<S>, error_reason?: string) {
    if (reported)
      return
    reported = true
    // TypeScript can't relate spreads of a generic Partial, so the event shape is asserted once here.
    trackSwapStep({ step, ok, ...context, duration_ms: Date.now() - startedAt, error_reason, ...startProps, ...props } as SwapStepEvent<S>)
  }
  return {
    end: (ok: boolean, props?: StepProps<S>) => report(ok, props),
    fail: (error: unknown, props?: StepProps<S>) => report(false, props, errorReason(error)),
  }
}

export function trackFundingProof(patchedSwap: Promise<{ status: string, preimage?: string }>, context: SwapTelemetryContext): void {
  const step = startSwapStep('funding_proof', context)
  void patchedSwap.then(
    swap => step.end(true, { swap_status: swap.status, has_preimage: !!swap.preimage }),
    (error: unknown) => {
      logger.warn('Fastspot rejected the funding proof', { ...context, error })
      step.fail(error)
    },
  )
}

// Shared by the NIM and USDT settlement waits. Durations count from the funding proof, when Fastspot can start paying.
export function startSwapSettlement(context: SwapTelemetryContext, fundingProofStartedAt: number) {
  const step = startSwapStep('settlement', context, undefined, fundingProofStartedAt)
  let polls = 0
  let lastStatus: string | undefined
  const stats = () => ({ polls, last_status: lastStatus ?? null })
  // The in-app flow waits behind the PIN spinner, and users kill the app before the final event.
  const slowTimer = window.setTimeout(
    () => trackSwapStep({ step: 'settlement_slow', ok: false, ...context, duration_ms: Date.now() - fundingProofStartedAt, ...stats() }),
    Math.max(0, fundingProofStartedAt + SWAP_SETTLEMENT_SLOW_MS - Date.now()),
  )
  const stop = () => window.clearTimeout(slowTimer)
  return {
    poll(status: string) {
      polls++
      if (status === lastStatus)
        return
      logger.log('⚡ Swap status changed', { asset: context.asset, swapId: context.swap_id, from: lastStatus ?? null, to: status, polls })
      lastStatus = status
    },
    end(preimageSource: 'funding_proof' | 'poll') {
      stop()
      step.end(true, { ...stats(), preimage_source: preimageSource })
    },
    fail(error: unknown) {
      stop()
      step.fail(error, stats())
    },
    // For exits without an outcome, like a wallet switch mid-settlement.
    stop,
  }
}
