import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// Everything counts except what can't reach the JS bundle. Counting these would flag a correct build as stale, e.g. the
// temporary versionCode bump for the Capgo OTA trap, or agent docs edited during a device test.
const NOT_BUNDLED = ['android', 'ios', 'docs', 'scripts', 'tests', 'nimiq-pay-tests', 'fastlane', '.claude', '.codex', '.agents', '.github', '*.md']
const PATHSPEC = ['.', ...NOT_BUNDLED.map(path => `:(exclude)${path}`)]

// Uncommitted changes count: device tests run before the commit, when Before and After builds share the same HEAD.
export function buildStamp(cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 2 ** 30 })
  try {
    const head = git('rev-parse', '--short=12', 'HEAD').toString().trim()
    // --submodule=diff: the default prints only `-dirty` for a changed submodule, whatever the change is.
    const diff = git('diff', 'HEAD', '--binary', '--submodule=diff', '--', ...PATHSPEC)
    const untracked = git('ls-files', '--others', '--exclude-standard', '-z', '--', ...PATHSPEC).toString().split('\0').filter(Boolean)
    if (!diff.length && !untracked.length)
      return head
    const hash = createHash('sha256').update(diff)
    for (const file of untracked)
      hash.update(file).update(readFileSync(join(cwd, file)))
    return `${head}-${hash.digest('hex').slice(0, 12)}`
  }
  catch {
    return 'unknown'
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(buildStamp())
