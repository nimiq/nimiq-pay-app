import { execFileSync } from 'node:child_process'

const BACKENDS = [
  { cmd: 'claude', args: ['-p'] },
  { cmd: 'codex', args: ['exec', '-'] },
]

export function detectAvailable() {
  return BACKENDS.filter(({ cmd }) => {
    try {
      execFileSync('which', [cmd], { stdio: 'ignore' })
      return true
    }
    catch {
      return false
    }
  })
}

export function selectAi(available, requested) {
  const cmd = requested.trim().toLowerCase()
  const selected = available.find(ai => ai.cmd === cmd)
  if (!selected)
    throw new Error(`AI CLI \`${cmd}\` is not available. Choose claude or codex.`)
  return selected
}
