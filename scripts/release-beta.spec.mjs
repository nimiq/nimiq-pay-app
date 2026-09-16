import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { Readable, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import releaseConfig from '../.release-it.json'
import packageJson from '../package.json'
import { selectAi } from './changelog-ai.mjs'
import { askForAi } from './release-beta.mjs'

describe('github release credentials', () => {
  it.each([undefined, '', '   '])('stops before initialization with token %j', (token) => {
    const env = { ...process.env }
    delete env.GITHUB_TOKEN
    if (token !== undefined)
      env.GITHUB_TOKEN = token

    const result = spawnSync(releaseConfig.hooks['before:init'], { shell: true, encoding: 'utf8', env })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('GITHUB_TOKEN is required')
  })

  it('allows initialization with a token without printing it', () => {
    const result = spawnSync(releaseConfig.hooks['before:init'], {
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: 'release-test-token' },
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
  })
})

describe('beta release changelog AI selection', () => {
  it('prompts before starting release-it', () => {
    expect(packageJson.scripts['release:beta']).toBe('pnpm i18n:sync && node scripts/release-beta.mjs')
  })

  it('accepts Codex from the release prompt', async () => {
    let prompt = ''
    const output = new Writable({
      write(chunk, _encoding, done) {
        prompt += chunk.toString()
        done()
      },
    })
    const ai = await askForAi({
      available: [{ cmd: 'claude', args: ['-p'] }, { cmd: 'codex', args: ['exec', '-'] }],
      input: Readable.from(['codex\n']),
      output,
    })

    expect(prompt).toContain('Which AI CLI should write the changelog? [claude/codex]')
    expect(ai.cmd).toBe('codex')
  })

  it('resolves the selected CLI for the changelog hook', () => {
    expect(selectAi([{ cmd: 'claude' }, { cmd: 'codex' }], 'CODEX')).toEqual({ cmd: 'codex' })
  })
})
