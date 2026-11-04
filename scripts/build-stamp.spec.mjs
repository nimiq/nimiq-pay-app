import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildStamp } from './build-stamp.mjs'

let directory
let head

function git(...args) {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: directory, encoding: 'utf8' }).trim()
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'build-stamp-'))
  mkdirSync(join(directory, 'src'))
  mkdirSync(join(directory, 'android'))
  writeFileSync(join(directory, 'src/a.ts'), 'a')
  writeFileSync(join(directory, 'android/build.gradle'), 'versionCode 1')
  git('init', '-q')
  git('add', '.')
  git('commit', '-qm', 'init')
  head = git('rev-parse', '--short=12', 'HEAD')
})

afterEach(() => rmSync(directory, { recursive: true, force: true }))

describe('buildStamp', () => {
  it('is the commit on a clean tree', () => {
    expect(buildStamp(directory)).toBe(head)
  })

  it('tells uncommitted bundle changes apart on the same commit', () => {
    writeFileSync(join(directory, 'src/a.ts'), 'fix')
    const fix = buildStamp(directory)
    writeFileSync(join(directory, 'src/a.ts'), 'other fix')

    expect(fix).toMatch(new RegExp(`^${head}-[0-9a-f]{12}$`))
    expect(buildStamp(directory)).not.toBe(fix)
  })

  it('counts untracked bundle files by content', () => {
    writeFileSync(join(directory, 'src/new.ts'), 'one')
    const one = buildStamp(directory)
    writeFileSync(join(directory, 'src/new.ts'), 'two')

    expect(one).not.toBe(head)
    expect(buildStamp(directory)).not.toBe(one)
  })

  it('counts bundle inputs outside src', () => {
    writeFileSync(join(directory, 'tailwind.config.js'), 'config')

    expect(buildStamp(directory)).not.toBe(head)
  })

  it('tells uncommitted submodule changes apart', () => {
    const submodule = mkdtempSync(join(tmpdir(), 'build-stamp-submodule-'))
    writeFileSync(join(submodule, 'provider.ts'), 'a')
    for (const args of [['init', '-q'], ['add', '.'], ['commit', '-qm', 'init']])
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: submodule })
    git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', submodule, 'vendor/provider')
    git('commit', '-qm', 'submodule')

    writeFileSync(join(directory, 'vendor/provider/provider.ts'), 'edit one')
    const one = buildStamp(directory)
    writeFileSync(join(directory, 'vendor/provider/provider.ts'), 'edit two')

    expect(buildStamp(directory)).not.toBe(one)
    rmSync(submodule, { recursive: true, force: true })
  })

  it('ignores changes outside the bundle', () => {
    writeFileSync(join(directory, 'android/build.gradle'), 'versionCode 2')
    writeFileSync(join(directory, 'notes.md'), 'x')

    expect(buildStamp(directory)).toBe(head)
  })

  it('is unknown outside a git repository', () => {
    rmSync(join(directory, '.git'), { recursive: true })

    expect(buildStamp(directory)).toBe('unknown')
  })
})
