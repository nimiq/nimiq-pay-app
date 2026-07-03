#!/usr/bin/env node
// Generates the in-app changelog (src/data/changelog.json), a repo CHANGELOG.md,
// and — with --print-latest — the GitLab release notes markdown (stdout).
//
// Usage:
//   node scripts/generate-changelog.mjs [version] [--print-latest] [--force]
//
// - version: the release version. Defaults to package.json "version".
//            release-it passes ${version} (the next version) via .release-it.json.
// - --print-latest: print the release-notes markdown for `version` to STDOUT and
//                   nothing else (all logs go to stderr). Used as release-it's
//                   `gitlab.releaseNotes` command so the notes land in the GitLab release.
// - --force: regenerate even if an entry for `version` already exists.
//
// Idempotent: if src/data/changelog.json already has an entry for `version`, the AI
// is NOT called again (manual edits are preserved) unless --force is passed.
//
// AI backend is auto-detected: `claude -p` is preferred, `codex exec` is the fallback.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHANGELOG_JSON = join(ROOT, 'src/data/changelog.json')
const CHANGELOG_MD = join(ROOT, 'CHANGELOG.md')
const RELEASE_COMMIT_GREP = '🚀 Release v'
const AI_TIMEOUT_MS = 3 * 60 * 1000

const args = process.argv.slice(2)
const printLatest = args.includes('--print-latest')
const force = args.includes('--force')
const sinceArg = args.find(a => a.startsWith('--since='))?.slice('--since='.length)
const versionArg = args.find(a => !a.startsWith('--'))

// Keep stdout clean for release-it: everything diagnostic goes to stderr.
const log = (...parts) => process.stderr.write(`${parts.join(' ')}\n`)

function git(cmdArgs) {
  return execFileSync('git', cmdArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim()
}

function getVersion() {
  if (versionArg)
    return versionArg
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  return pkg.version
}

// The git range (previous release .. HEAD) we diff for the changelog. Prefer the
// `🚀 Release v` commit over git tags: this repo's recent releases aren't reliably
// tagged, so `git describe --tags` can point at a much older release. Tags are the
// fallback; a bounded window is the last resort for a first-ever changelog.
function resolveRange() {
  let prevRef = sinceArg
  if (!prevRef) {
    try {
      prevRef = git(['log', `--grep=${RELEASE_COMMIT_GREP}`, '-n1', '--pretty=%H'])
    }
    catch {}
  }
  if (!prevRef) {
    try {
      prevRef = git(['describe', '--tags', '--abbrev=0'])
    }
    catch {}
  }
  if (!prevRef) {
    log('⚠️  No previous release commit or tag found; using the last 50 commits.')
    prevRef = 'HEAD~50'
  }
  const range = `${prevRef}..HEAD`
  try {
    git(['rev-list', '--count', range]) // throws if prevRef is unresolvable
    return range
  }
  catch {
    return 'HEAD'
  }
}

function gitLog(range, format) {
  return git(['log', range, '--no-merges', `--pretty=format:${format}`, '-n', '300'])
}

function loadEntries() {
  if (!existsSync(CHANGELOG_JSON))
    return []
  try {
    const parsed = JSON.parse(readFileSync(CHANGELOG_JSON, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    log(`⚠️  ${CHANGELOG_JSON} is not valid JSON; starting fresh.`)
    return []
  }
}

function detectAi() {
  const has = (cmd) => {
    try {
      execFileSync('which', [cmd], { stdio: 'ignore' })
      return true
    }
    catch {
      return false
    }
  }
  if (has('claude'))
    return { cmd: 'claude', args: ['-p'] }
  if (has('codex'))
    return { cmd: 'codex', args: ['exec', '-'] }
  return null
}

function buildPrompt(version, commitLog) {
  return `You are writing the user-facing changelog for "Nimiq Pay", a mobile crypto wallet app.

Summarize the changes below for a NON-TECHNICAL user, for version ${version}.

Rules:
- Return ONLY a JSON object, no prose, no markdown fences.
- Shape: {"version":"${version}","highlights":[{"title":"...","description":"...","howTo":"..."}]}
- 2 to 5 highlights. "title" is a short headline (a few words). "description" is 1-2
  friendly sentences explaining the benefit to the user.
- "howTo" is OPTIONAL: include it only for a NEW feature the user can act on, describing
  where to find it or how to use it in plain steps. Omit the field otherwise.
- IGNORE internal-only changes: chores, CI, refactors, dependency bumps, i18n extraction,
  linting, tests, build config.
- If nothing user-facing changed, return a single highlight titled "Improvements & bug fixes"
  describing that this release contains under-the-hood stability and performance improvements.
- Do NOT invent features that are not in the commits.

Commits since the previous release:
${commitLog || '(no commits found)'}
`
}

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1)
    throw new Error('No JSON object found in AI output')
  return JSON.parse(candidate.slice(start, end + 1))
}

function generateEntry(version, commitLog) {
  const ai = detectAi()
  if (!ai)
    throw new Error('Neither `claude` nor `codex` CLI is available. Install one or edit src/data/changelog.json manually.')
  log(`🤖 Generating changelog for v${version} via ${ai.cmd}...`)
  const output = execFileSync(ai.cmd, ai.args, {
    cwd: ROOT,
    input: buildPrompt(version, commitLog),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: AI_TIMEOUT_MS,
  })
  const parsed = extractJson(output)
  if (!parsed || !Array.isArray(parsed.highlights) || parsed.highlights.length === 0)
    throw new Error(`AI returned no valid highlights:\n${output}`)
  for (const h of parsed.highlights) {
    if (!h.title || !h.description)
      throw new Error(`AI highlight missing title/description:\n${JSON.stringify(h)}`)
  }
  return {
    version,
    date: new Date().toISOString().slice(0, 10),
    highlights: parsed.highlights.map(h => ({
      title: String(h.title).trim(),
      description: String(h.description).trim(),
      ...(h.howTo ? { howTo: String(h.howTo).trim() } : {}),
    })),
  }
}

function writeJson(entries) {
  mkdirSync(dirname(CHANGELOG_JSON), { recursive: true })
  writeFileSync(CHANGELOG_JSON, `${JSON.stringify(entries, null, 2)}\n`)
}

function entryToMarkdown(entry) {
  const lines = [`## ${entry.version} — ${entry.date}`, '']
  for (const h of entry.highlights) {
    lines.push(`### ${h.title}`, h.description)
    if (h.howTo)
      lines.push('', `_How to use:_ ${h.howTo}`)
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

// CHANGELOG.md is fully derived from the JSON so both never drift.
function writeChangelogMd(entries) {
  const body = entries.map(entryToMarkdown).join('\n\n')
  writeFileSync(CHANGELOG_MD, `# Changelog\n\nAll notable changes to Nimiq Pay.\n\n${body}\n`)
}

function renderReleaseNotes(entry, subjects) {
  const parts = [entryToMarkdown(entry)]
  if (subjects) {
    parts.push('', '<details><summary>All changes</summary>', '', subjects, '', '</details>')
  }
  return parts.join('\n')
}

function confirmReview() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    rl.question(`\n📝 Review/edit ${CHANGELOG_JSON} now, then press Enter to continue (Ctrl+C to abort)... `, () => {
      rl.close()
      resolve()
    })
  })
}

async function main() {
  const version = getVersion()
  let entries = loadEntries()
  const existingIndex = entries.findIndex(e => e.version === version)
  let entry = existingIndex >= 0 ? entries[existingIndex] : null

  // Only touch git and the AI when we actually need to generate a new entry.
  if (entry && !force) {
    log(`♻️  Reusing existing entry for v${version}.`)
  }
  else {
    const range = resolveRange()
    log(`📦 Changelog for v${version} — ${range}`)
    entry = generateEntry(version, gitLog(range, '%s%n%b%n<<<commit>>>'))
    if (existingIndex >= 0)
      entries[existingIndex] = entry
    else
      entries.unshift(entry)
    writeJson(entries)
    log(`✅ Wrote ${CHANGELOG_JSON}`)
    if (!printLatest && process.stdin.isTTY) {
      await confirmReview()
      // Pick up any manual edits made during the pause.
      entries = loadEntries()
      entry = entries.find(e => e.version === version) || entry
    }
  }

  // Keep CHANGELOG.md fully derived from the (possibly hand-edited) JSON.
  writeChangelogMd(entries)

  if (printLatest)
    process.stdout.write(`${renderReleaseNotes(entry, gitLog(resolveRange(), '- %s (%h)'))}\n`)
}

main().catch((err) => {
  log(`❌ ${err.message}`)
  process.exit(1)
})
