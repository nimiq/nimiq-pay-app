import { concepts, formats, getPreview } from '/config.mjs'
import { renderPreview } from '/renderer.mjs'

const gallery = document.querySelector('#gallery')
const exportAllButton = document.querySelector('#export-all')
const batchStatus = document.querySelector('#batch-status')
const cards = new Map()

function previewKey(preview) {
  return `${preview.id}/${preview.conceptId}`
}

function createCard(preview) {
  const card = document.createElement('article')
  card.className = 'preview-card'
  card.dataset.preview = previewKey(preview)
  card.dataset.state = 'loading'
  card.style.setProperty('--preview-aspect', `${preview.width} / ${preview.height}`)
  card.innerHTML = `
    <div class="canvas-wrap">
      <canvas aria-label="${preview.label}: ${preview.title}"></canvas>
    </div>
    <div class="card-body">
      <div class="card-copy">
        <p class="card-title">${preview.title}</p>
        <p class="card-meta">${preview.width} x ${preview.height} PNG</p>
      </div>
      <button class="export-one" type="button" disabled>Export PNG</button>
      <p class="card-status" role="status" aria-live="polite">Loading screenshot…</p>
    </div>
  `
  return card
}

function loadImage(source, missingMessage) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => image.naturalWidth && image.naturalHeight
      ? resolve(image)
      : reject(new Error(`${missingMessage} has no dimensions`))
    image.onerror = () => reject(new Error(`${missingMessage} is missing`))
    image.src = source
  })
}

function renderError(canvas, preview, message) {
  canvas.width = preview.width
  canvas.height = preview.height
  const context = canvas.getContext('2d')
  context.fillStyle = '#10172c'
  context.fillRect(0, 0, preview.width, preview.height)
  context.fillStyle = '#ff9ca4'
  context.font = `700 ${Math.round(preview.width * 0.045)}px Mulish, sans-serif`
  context.textAlign = 'center'
  context.fillText(message, preview.width / 2, preview.height / 2)
}

async function prepareCard(preview, card, backgroundPromise) {
  const canvas = card.querySelector('canvas')
  const button = card.querySelector('.export-one')
  const status = card.querySelector('.card-status')
  try {
    const [image, background] = await Promise.all([
      loadImage(`/source/${preview.id}/${preview.conceptId}`, 'Screenshot'),
      backgroundPromise,
    ])
    renderPreview(canvas, preview, image, background)
    card.dataset.state = 'ready'
    status.textContent = 'Ready'
    button.disabled = false
  }
  catch (error) {
    renderError(canvas, preview, error.message)
    card.dataset.state = 'error'
    status.textContent = error.message
  }
}

function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png')
  })
}

async function exportPreview(preview) {
  const card = cards.get(previewKey(preview))
  if (card.dataset.state === 'error')
    throw new Error('Preview is not ready')

  const button = card.querySelector('.export-one')
  const status = card.querySelector('.card-status')
  button.disabled = true
  card.dataset.state = 'exporting'
  status.textContent = 'Saving…'
  try {
    const png = await canvasToPng(card.querySelector('canvas'))
    const response = await fetch(`/api/export/${preview.id}/${preview.conceptId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.error || 'Save failed')
    card.dataset.state = 'saved'
    status.textContent = result.saved
    return result.saved
  }
  catch (error) {
    card.dataset.state = 'error'
    status.textContent = error.message
    throw error
  }
  finally {
    button.disabled = card.dataset.state === 'error'
  }
}

function setAllControlsDisabled(disabled) {
  exportAllButton.disabled = disabled
  document.querySelectorAll('.export-one').forEach((button) => {
    const card = button.closest('.preview-card')
    button.disabled = disabled || card.dataset.state === 'error'
  })
}

for (const format of formats) {
  const section = document.createElement('section')
  section.className = 'format-section'
  section.innerHTML = `
    <div class="format-heading">
      <h2>${format.label}</h2>
      <p>${format.width} x ${format.height}</p>
    </div>
    <div class="preview-grid"></div>
  `
  const grid = section.querySelector('.preview-grid')
  for (const concept of concepts) {
    const preview = getPreview(format.id, concept.id)
    const card = createCard(preview)
    cards.set(previewKey(preview), card)
    grid.append(card)
    card.querySelector('.export-one').addEventListener('click', () => exportPreview(preview).catch(() => {}))
  }
  gallery.append(section)
}

await document.fonts.load('700 80px Mulish')
const previews = formats.flatMap(format => concepts.map(concept => getPreview(format.id, concept.id)))
const backgroundPromise = loadImage('/background.svg', 'Background')
await Promise.all(previews.map(preview => prepareCard(preview, cards.get(previewKey(preview)), backgroundPromise)))

const readyCount = [...cards.values()].filter(card => card.dataset.state === 'ready').length
batchStatus.textContent = `${readyCount} of ${cards.size} previews ready`
exportAllButton.disabled = readyCount !== cards.size

exportAllButton.addEventListener('click', async () => {
  setAllControlsDisabled(true)
  let saved = 0
  let failed = 0
  for (const preview of previews) {
    batchStatus.textContent = `Saving ${saved + failed + 1} of ${previews.length}…`
    try {
      await exportPreview(preview)
      saved++
    }
    catch {
      failed++
    }
  }
  batchStatus.textContent = failed ? `${saved} saved, ${failed} failed` : `${saved} saved`
  setAllControlsDisabled(false)
})
