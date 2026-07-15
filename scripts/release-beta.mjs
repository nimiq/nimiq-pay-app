#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { detectAvailable, selectAi } from './changelog-ai.mjs'

export function askForAi({ available = detectAvailable(), input = process.stdin, output = process.stderr } = {}) {
  if (available.length === 0)
    return Promise.reject(new Error('Neither `claude` nor `codex` CLI is available.'))

  const defaultAi = available[0].cmd
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input, output })
    rl.question(`\n🤖 Which AI CLI should write the changelog? [claude/codex] (default: ${defaultAi}): `, (answer) => {
      rl.close()
      try {
        resolve(selectAi(available, answer || defaultAi))
      }
      catch (error) {
        reject(error)
      }
    })
  })
}

async function main() {
  const ai = await askForAi()
  const release = spawnSync('dotenv', ['release-it'], {
    stdio: 'inherit',
    env: { ...process.env, CHANGELOG_AI: ai.cmd },
  })
  if (release.error)
    throw release.error
  process.exitCode = release.status ?? 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`❌ ${error.message}\n`)
    process.exitCode = 1
  })
}
