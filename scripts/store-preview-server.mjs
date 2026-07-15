import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getExportRelativePath, getPreview } from '../fastlane/screenshots/previews/config.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const maxPngBytes = 15 * 1024 * 1024
const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/config.mjs', ['config.mjs', 'text/javascript; charset=utf-8']],
  ['/renderer.mjs', ['renderer.mjs', 'text/javascript; charset=utf-8']],
  ['/background.svg', ['background.svg', 'image/svg+xml; charset=utf-8']],
])

export function resolveExportPath(root, formatId, conceptId) {
  return join(root, 'fastlane/screenshots/previews/exports', getExportRelativePath(formatId, conceptId))
}

export function validatePng(buffer) {
  if (buffer.length < pngSignature.length || !buffer.subarray(0, pngSignature.length).equals(pngSignature))
    throw Object.assign(new Error('Invalid PNG payload'), { statusCode: 415 })
}

async function readPng(request) {
  if (request.headers['content-type'] !== 'image/png')
    throw Object.assign(new Error('Expected image/png'), { statusCode: 415 })

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxPngBytes)
      throw Object.assign(new Error('PNG exceeds 15 MB'), { statusCode: 413 })
    chunks.push(chunk)
  }
  const png = Buffer.concat(chunks)
  validatePng(png)
  return png
}

function respond(response, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
  response.end(body)
}

function respondJson(response, statusCode, value) {
  respond(response, statusCode, JSON.stringify(value), 'application/json; charset=utf-8')
}

async function sendFile(response, path, contentType) {
  const file = await stat(path)
  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': file.size,
    'Cache-Control': 'no-store',
  })
  createReadStream(path).pipe(response)
}

function imageContentType(path) {
  return extname(path).toLowerCase() === '.jpg' ? 'image/jpeg' : 'image/png'
}

export function createStorePreviewServer(root = projectRoot) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      const staticFile = staticFiles.get(url.pathname)
      if (request.method === 'GET' && staticFile) {
        await sendFile(response, join(root, 'fastlane/screenshots/previews', staticFile[0]), staticFile[1])
        return
      }
      if (request.method === 'GET' && url.pathname === '/font/mulish') {
        await sendFile(response, join(root, 'src/assets/fonts/Mulish-VariableFont_wght.ttf'), 'font/ttf')
        return
      }

      const sourceMatch = url.pathname.match(/^\/source\/([^/]+)\/([^/]+)$/)
      if (request.method === 'GET' && sourceMatch) {
        const preview = getPreview(sourceMatch[1], sourceMatch[2])
        await sendFile(response, join(root, preview.source), imageContentType(preview.source))
        return
      }

      const exportMatch = url.pathname.match(/^\/api\/export\/([^/]+)\/([^/]+)$/)
      if (request.method === 'POST' && exportMatch) {
        const [formatId, conceptId] = exportMatch.slice(1)
        const relativePath = getExportRelativePath(formatId, conceptId)
        const outputPath = resolveExportPath(root, formatId, conceptId)
        const png = await readPng(request)
        await mkdir(dirname(outputPath), { recursive: true })
        await writeFile(outputPath, png)
        respondJson(response, 200, { saved: `fastlane/screenshots/previews/exports/${relativePath}` })
        return
      }

      respond(response, 404, 'Not found')
    }
    catch (error) {
      const statusCode = error.code === 'ENOENT' ? 404 : error.statusCode || 400
      respondJson(response, statusCode, { error: error.message })
    }
  })
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', url] : [url]
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = '127.0.0.1'
  const port = 4175
  createStorePreviewServer().listen(port, host, () => {
    const url = `http://${host}:${port}`
    console.log(`Store preview exporter: ${url}`)
    if (process.argv.includes('--open')) openBrowser(url)
  })
}
