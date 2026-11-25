import { Buffer } from 'node:buffer'
import { writeFileSync } from 'node:fs'
import process from 'node:process'

const [out, ...targets] = process.argv.slice(2)
if (!out) {
  console.error('usage: CDP_PORT=9333 node cdp-shot.mjs <out.png> [css selector | text:<visible text>]...')
  process.exit(2)
}
const port = process.env.CDP_PORT ?? '9333'

const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const target = pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl)
if (!target) {
  console.error(`no page on CDP port ${port}; forward the app WebView first (device.md "Live state")`)
  process.exit(1)
}
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((open, fail) => {
  socket.onopen = open
  socket.onerror = () => fail(new Error(`can't connect to ${target.webSocketDebuggerUrl}`))
})
const pending = new Map()
socket.onmessage = (event) => {
  const message = JSON.parse(event.data)
  pending.get(message.id)?.(message)
}
let lastId = 0
function send(method, params = {}) {
  const id = ++lastId
  return new Promise((done, fail) => {
    pending.set(id, message => message.error ? fail(new Error(`${method}: ${message.error.message}`)) : done(message.result))
    socket.send(JSON.stringify({ id, method, params }))
  })
}

function measure(targets) {
  const visible = element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  const area = element => element.getBoundingClientRect().width * element.getBoundingClientRect().height
  const find = (target) => {
    if (!target.startsWith('text:'))
      return document.querySelector(target)
    const text = target.slice(5)
    return [...document.body.querySelectorAll('*')]
      .filter(element => element.textContent.includes(text) && area(element) > 0 && visible(element))
      .sort((a, b) => area(a) - area(b))[0] ?? null
  }
  return {
    width: innerWidth,
    height: innerHeight,
    boxes: targets.map((target) => {
      const element = find(target)
      if (!element)
        return { target }
      const box = element.getBoundingClientRect()
      return { target, x: box.x, y: box.y, w: box.width, h: box.height }
    }),
  }
}

try {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  const png = Buffer.from(data, 'base64')
  writeFileSync(out, png)
  const { result } = await send('Runtime.evaluate', { expression: `(${measure})(${JSON.stringify(targets)})`, returnByValue: true })
  const { width, height, boxes } = result.value
  const percent = (value, total) => Math.round(Math.min(Math.max(value / total, 0), 1) * 1000) / 10
  console.log(`viewport="${png.readUInt32BE(16)}x${png.readUInt32BE(20)}"`)
  for (const box of boxes) {
    console.log(box.target)
    console.log(box.w === undefined ? '  not found' : `::::annotation{x=${percent(box.x, width)} y=${percent(box.y, height)} w=${percent(box.w, width)} h=${percent(box.h, height)} side="right"}`)
  }
  console.log(`Wrote ${out}`)
  if (boxes.some(box => box.w === undefined)) {
    console.error('target not in WebView DOM: native dialog or sheet (device screenshot instead, references/annotate.md) or wrong selector')
    process.exitCode = 1
  }
}
finally {
  socket.close()
}
