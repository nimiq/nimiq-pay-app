interface Transaction {
  title: string
  datetime: string
  id: string
  type: number
  ts: number
  amount: number
  status: number
  wlId: string
  peerId: string
  peerName: string
  fee?: number
  fiatUnit?: string
  fiatAmount?: number
  raw: string
  block: string
  blockHeight: string
  details?: string
  rail: string
  railId?: string
  railPeerId?: string
  location?: string
}

interface Task {
  description: string
  id: string
  order: number
  parent_task_id: string | null
  reward_amount: number
  status: string
  task_prover_function: string
}
