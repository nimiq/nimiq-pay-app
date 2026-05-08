export interface SwapHtlc {
  address: string
  amount: number
  timeout_block: number
  swap_id: string
  swap_status: string
  htlc_id?: string | null
}
