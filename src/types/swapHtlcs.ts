export interface SwapHtlc {
  address: string
  amount: number
  timeout_block: number
  swap_id: string
  swap_status: string
  htlc_id?: string | null
  tx_hash?: string | null
  refund_hash?: string | null
  refund_timestamp?: number | null
  refund_block?: number | null
}

export function getSwapHtlcTxHash(htlc: SwapHtlc): string | null {
  return htlc.tx_hash || (htlc.address !== htlc.htlc_id ? htlc.address : null)
}
