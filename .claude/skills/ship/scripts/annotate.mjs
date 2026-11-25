import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, extname, join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { stripVTControlCharacters } from 'node:util'

const [inputArg, outArg, rowPattern] = process.argv.slice(2)
if (!inputArg || !outArg) {
  console.error('usage: node annotate.mjs <spec.md> <out.png|out.mp4>\n       node annotate.mjs <log.txt> <out.png> [row regex]')
  process.exit(2)
}
const input = resolve(inputArg)
const out = resolve(outArg)

const PACKAGES = ['comark-annotate@0.12.2', 'comark@0.9.2', '@comark/html@0.9.2', 'playwright@1.65.1']
const RED = '#D94432'
const GREEN = '#21BCA5'
const NAVY = '#1F2348'
const GITHUB_FREE_LIMIT = 10 * 1024 * 1024
const sideOf = file => file.match(/-(before|after)(?:-\d+)?\.\w+$/)?.[1]

const gitCommonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: import.meta.dirname, encoding: 'utf8' }).trim()
const toolDir = join(dirname(gitCommonDir), '.claude/worktrees/.ship/.annotate')
if (!existsSync(join(toolDir, 'node_modules/comark-annotate'))) {
  mkdirSync(toolDir, { recursive: true })
  writeFileSync(join(toolDir, 'package.json'), '{"name":"ship-annotate","private":true}\n')
  execFileSync('pnpm', ['add', ...PACKAGES], { cwd: toolDir, stdio: 'inherit' })
}
execFileSync(join(toolDir, 'node_modules/.bin/playwright'), ['install', '--only-shell', 'chromium'], { stdio: 'inherit' })
const { chromium } = createRequire(join(toolDir, 'package.json'))('playwright')

async function withPage(url, width, scale, use) {
  const browser = await chromium.launch()
  try {
    const tab = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: scale })
    await tab.goto(url)
    await tab.waitForLoadState('networkidle')
    await tab.evaluate(() => document.fonts.ready)
    return await use(tab)
  }
  finally {
    await browser.close()
  }
}

if (extname(input) === '.txt') {
  const escape = text => text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char])
  const lines = stripVTControlCharacters(readFileSync(input, 'utf8')).replace(/\t/g, '    ').trimEnd().split('\n')
  const html = join(dirname(out), `.${basename(out, '.png')}.html`)
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>body{margin:0}pre{display:inline-block;min-width:60ch;margin:0;padding:16px 20px;background:#fff;color:${NAVY};font:15px/22px Menlo,monospace}span{display:inline-block;min-height:22px}</style><pre>${lines.map(line => `<span>${escape(line)}</span>`).join('\n')}</pre>`)
  try {
    const rows = await withPage(pathToFileURL(html).href, 1200, 2, async (tab) => {
      await tab.locator('pre').screenshot({ path: out })
      return tab.evaluate(() => {
        const box = document.querySelector('pre').getBoundingClientRect()
        return { width: box.width, height: box.height, rows: [...document.querySelectorAll('span')].map((span) => {
          const row = span.getBoundingClientRect()
          return { text: span.textContent, x: row.x - box.x, y: row.y - box.y, w: row.width, h: row.height }
        }) }
      })
    })
    const percent = (value, total) => Math.round(value / total * 1000) / 10
    console.log(`viewport="${Math.round(rows.width * 2)}x${Math.round(rows.height * 2)}"`)
    const match = rowPattern ? new RegExp(rowPattern) : null
    const side = sideOf(basename(input)) === 'before' ? 'left' : 'right'
    for (const row of rows.rows.filter(row => match?.test(row.text)))
      console.log(`${row.text.trim()}\n::::annotation{x=${percent(row.x, rows.width)} y=${percent(row.y, rows.height)} w=${percent(row.w, rows.width)} h=${percent(row.h, rows.height)} mark="highlight" side="${side}"}`)
  }
  finally {
    rmSync(html, { force: true })
  }
  console.log(`Wrote ${out}`)
  process.exit(0)
}

const cli = join(toolDir, 'node_modules/.bin/comark-annotate')
const sources = [...readFileSync(input, 'utf8').matchAll(/:::screenshot\{[^}]*src="([^"]+)"/g)].map(match => match[1])
const sides = sources.map(sideOf)
if (sides.includes(undefined)) {
  console.error(`name every screenshot <scenario>-before.png / <scenario>-after.png (flows: -before-1.png): ${sources.filter(src => !sideOf(src)).join(', ')}`)
  process.exit(1)
}
const columns = Math.max(sides.filter(side => side === 'before').length, sides.filter(side => side === 'after').length)
const flow = columns > 1
const video = extname(out) === '.mp4'
const width = flow ? 48 + columns * 520 : 1200

const before = '.ca-screenshot.side-before'
const after = '.ca-screenshot.side-after'
const divider = 'rgb(31 35 72 / .25)'
const css = [
  'body>*{min-width:0;margin:0!important}',
  'body:not(.flow){display:flex;gap:1.5rem;align-items:flex-start}',
  'body:not(.flow)>*{flex:1 1 0}',
  `body:not(.flow)>:has(.side-after){border-left:2px dashed ${divider};padding-left:1.5rem}`,
  `body:not(.flow) ${before} .ca-heading{justify-content:flex-end}`,
  `body:not(.flow) ${before} figcaption{text-align:end}`,
  `body.flow{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:1.5rem}`,
  'body.flow>:has(.side-before){grid-row:1}',
  `body.flow::before{content:"";grid-row:2;grid-column:1/-1;border-top:2px dashed ${divider}}`,
  'body.flow>:has(.side-after){grid-row:3}',
  '.ca{--ca-note-font:"Shantell Sans",cursive;--ca-note-size:1.2em;--ca-gutter:12rem}',
  '.ca-callout,.ca-heading,.ca-label{font-weight:600}',
  `.ca-heading,.ca-label{color:${NAVY}}`,
  `${before} *{--ca-color:${RED}!important;--ca-solid:${RED}!important}`,
  `${after} *{--ca-color:${GREEN}!important;--ca-solid:${GREEN}!important}`,
  '.ca-mark svg{stroke-opacity:.85}',
  '.ca-box svg{stroke-opacity:.5}',
  `${after} .ca-mark svg{stroke-opacity:.12;stroke-width:1.5px}`,
  ...video ? ['html,body,.ca,.ca-screenshot,.ca-stage{background:transparent!important}', '.ca-stage img{opacity:0}'] : [],
].join('')

try {
  execFileSync(cli, ['check', input], { cwd: dirname(input), stdio: 'inherit' })
}
catch {
  process.exit(1)
}
const html = join(dirname(input), `.${basename(input, '.md')}.html`)
const overlay = join(dirname(input), `.${basename(input, '.md')}.overlay.png`)
try {
  execFileSync(cli, ['render', input, '-o', html], { cwd: dirname(input), stdio: ['ignore', 'ignore', 'inherit'] })
  const page = readFileSync(html, 'utf8')
    .replace(':root{color-scheme:light dark}', ':root{color-scheme:light}')
    .replace('<style>', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shantell+Sans:wght@600&display=block"><style>')
    .replace('body{max-width:60rem;margin:0 auto;padding:2.5rem 1.5rem;', `body{margin:0;padding:1.5rem;background:#fff;color:${NAVY};`)
    .replace('<body>', flow ? '<body class="flow">' : '<body>')
    .replace('</style></head>', `${css}</style></head>`)
    .replace(/<figure class="ca-screenshot/g, () => `<figure class="ca-screenshot side-${sides.shift()}`)
    .replace(/>([^<]+)</g, (_, text) => `>${text.replace(/(\d) (ms|[sh%]|min|KB|MB|GB)(?![\w-])/g, '$1\u00A0$2')}<`)
  writeFileSync(html, page)

  if (!video) {
    await withPage(pathToFileURL(html).href, width, 2, tab => tab.locator('body').screenshot({ path: out }))
    execFileSync('sips', ['--resampleWidth', String(Math.round(width * 7 / 6)), out], { stdio: 'ignore' })
  }
  else {
    const { size, clips } = await withPage(pathToFileURL(html).href, width, 1, async (tab) => {
      await tab.locator('body').screenshot({ path: overlay, omitBackground: true })
      return tab.evaluate(() => ({
        size: { w: document.body.offsetWidth, h: document.body.offsetHeight },
        clips: [...document.querySelectorAll('.ca-stage img')].map((img) => {
          const box = img.getBoundingClientRect()
          return { src: img.getAttribute('src'), x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) }
        }),
      }))
    })
    const files = clips.map(clip => join(dirname(input), clip.src.replace(/\.(?:png|jpe?g|webp)$/, '.mp4')))
    const missing = files.filter(file => !existsSync(file))
    if (missing.length) {
      console.error(`missing clip for each screenshot: ${missing.join(', ')}`)
      process.exit(1)
    }
    const seconds = Math.max(...files.map(file => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }))))
    const even = value => value + (value % 2)
    const layers = clips.map((clip, index) => `[${index + 1}:v]scale=${clip.w}:${clip.h},setsar=1,tpad=stop_mode=clone:stop_duration=${seconds}[clip${index}]`)
    const stack = clips.map((clip, index) => `[${index ? `layer${index - 1}` : 'canvas'}][clip${index}]overlay=${clip.x}:${clip.y}[layer${index}]`)
    const graph = [
      `color=c=white:s=${even(size.w)}x${even(size.h)}:r=30:d=${seconds}[canvas]`,
      ...layers,
      ...stack,
      `[layer${clips.length - 1}][0:v]overlay=0:0[out]`,
    ].join(';')
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-i', overlay, ...files.flatMap(file => ['-i', file]), '-filter_complex', graph, '-map', '[out]', '-t', String(seconds), '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out], { stdio: 'inherit' })
    if (statSync(out).size > GITHUB_FREE_LIMIT)
      console.error(`warning: ${Math.round(statSync(out).size / 1024 / 1024)} MB is over GitHub's 10 MB attachment limit on free plans; trim the clips`)
  }
}
finally {
  rmSync(html, { force: true })
  rmSync(overlay, { force: true })
}
console.log(`Wrote ${out}`)
