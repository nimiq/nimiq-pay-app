interface TaskMetadata {
  type: TaskType
  options: string[]
  id: string
  time: number
}

interface Task {
  description: string
  id: string
  metadata: TaskMetadata
  order: number
  parent_task_id: string | null
  reward_amount: number
  status: string
  task_prover_function: string
}

type TaskType = 'question' | 'text-input' | 'yt-video'

interface Toast {
  message: string
  type?: 'success' | 'warning' | 'error' | 'spinner'
  keepOpen?: boolean
  duration?: number
}
