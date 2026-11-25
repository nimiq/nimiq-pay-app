import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const [specArg, outArg] = process.argv.slice(2)
if (!specArg || !outArg) {
  console.error('usage: node annotate.mjs <spec.md> <out.png>')
  process.exit(2)
}
const spec = resolve(specArg)
const out = resolve(outArg)

const PACKAGES = ['comark-annotate@0.12.2', 'comark@0.9.2', '@comark/html@0.9.2', 'playwright@1.65.1']
const RED = '#D94432'
const GREEN = '#21BCA5'
const NAVY = '#1F2348'

const gitCommonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: import.meta.dirname, encoding: 'utf8' }).trim()
const toolDir = join(dirname(gitCommonDir), '.claude/worktrees/.ship/.annotate')
if (!existsSync(join(toolDir, 'node_modules/comark-annotate'))) {
  mkdirSync(toolDir, { recursive: true })
  writeFileSync(join(toolDir, 'package.json'), '{"name":"ship-annotate","private":true}\n')
  execFileSync('pnpm', ['add', ...PACKAGES], { cwd: toolDir, stdio: 'inherit' })
}
execFileSync(join(toolDir, 'node_modules/.bin/playwright'), ['install', '--only-shell', 'chromium'], { stdio: 'inherit' })
const cli = join(toolDir, 'node_modules/.bin/comark-annotate')

const before = '.ca-screenshot:has(img[src$="-before.png"])'
const after = '.ca-screenshot:has(img[src$="-after.png"])'
const css = [
  'body>*{flex:1 1 0;min-width:0;margin:0!important}',
  '.ca{--ca-note-font:"Shantell Sans",cursive;--ca-note-size:1.2em;--ca-gutter:12rem}',
  '.ca-callout,.ca-heading,.ca-label{font-weight:600}',
  `.ca-heading,.ca-label{color:${NAVY}}`,
  `${before} .ca-heading{justify-content:flex-end}`,
  `body>:has(img[src$="-after.png"]){border-left:2px dashed rgb(31 35 72 / .25);padding-left:1.5rem}`,
  `${before} *{--ca-color:${RED}!important;--ca-solid:${RED}!important}`,
  `${after} *{--ca-color:${GREEN}!important;--ca-solid:${GREEN}!important}`,
  '.ca-mark svg{stroke-opacity:.85}',
  '.ca-box svg{stroke-opacity:.5}',
  `${after} .ca-mark svg{stroke-opacity:.12;stroke-width:1.5px}`,
].join('')

try {
  execFileSync(cli, ['check', spec], { cwd: dirname(spec), stdio: 'inherit' })
}
catch {
  process.exit(1)
}
const html = join(dirname(spec), `.${basename(spec, '.md')}.html`)
try {
  execFileSync(cli, ['render', spec, '-o', html], { cwd: dirname(spec), stdio: ['ignore', 'ignore', 'inherit'] })
  const page = readFileSync(html, 'utf8')
    .replace(':root{color-scheme:light dark}', ':root{color-scheme:light}')
    .replace('<style>', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shantell+Sans:wght@600&display=block"><style>')
    .replace('body{max-width:60rem;margin:0 auto;padding:2.5rem 1.5rem;', `body{display:flex;gap:1.5rem;align-items:flex-start;margin:0;padding:1.5rem;background:#fff;color:${NAVY};`)
    .replace('</style></head>', `${css}</style></head>`)
  writeFileSync(html, page)

  const { chromium } = createRequire(join(toolDir, 'package.json'))('playwright')
  const browser = await chromium.launch()
  try {
    const tab = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })
    await tab.goto(pathToFileURL(html).href)
    await tab.waitForLoadState('networkidle')
    await tab.evaluate(() => document.fonts.ready)
    await tab.locator('body').screenshot({ path: out })
  }
  finally {
    await browser.close()
  }
  execFileSync('sips', ['-Z', '1400', out], { stdio: 'ignore' })
}
finally {
  rmSync(html, { force: true })
}
console.log(`Wrote ${out}`)
