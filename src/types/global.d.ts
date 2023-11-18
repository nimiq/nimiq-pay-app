interface Task {
  description: string
  id: string
  metadata: string
  order: number
  parent_task_id: string | null
  reward_amount: number
  status: string
  task_prover_function: string
}

type TaskType = 'question' | 'text-input' | 'yt-video'
