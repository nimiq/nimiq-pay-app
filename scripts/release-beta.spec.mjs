import { Readable, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import { selectAi } from './changelog-ai.mjs'
import { askForAi } from './release-beta.mjs'

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
