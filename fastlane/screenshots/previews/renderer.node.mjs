import assert from 'node:assert/strict'
import test from 'node:test'
import { formats, getPreview } from './config.mjs'
import { getImagePlacement, getLayout } from './renderer.mjs'

test('keeps every device frame inside its native canvas', () => {
  for (const format of formats) {
    const layout = getLayout(getPreview(format.id, 'nim'))
    assert.ok(layout.device.x >= 0)
    assert.ok(layout.device.y >= 0)
    assert.ok(layout.device.x + layout.device.width <= format.width)
    assert.ok(layout.device.y + layout.device.height <= format.height)
  }
})

test('uses a narrower phone composition on the iPad canvas', () => {
  const phone = getLayout(getPreview('ios-67', 'nim'))
  const ipad = getLayout(getPreview('ipad-11', 'nim'))
  assert.ok(phone.device.width / 1290 > 0.7)
  assert.ok(ipad.device.width / 1668 < phone.device.width / 1290)
})

test('makes the Android frame tall enough for its native screenshot', () => {
  const layout = getLayout(getPreview('android', 'usdt'))
  assert.ok(layout.device.height / 1920 > 0.77)
})

test('contains the complete Android screenshot inside the device viewport', () => {
  const viewport = { x: 10, y: 20, width: 640, height: 1450 }
  const image = { naturalWidth: 1344, naturalHeight: 2992 }
  const placement = getImagePlacement(image, viewport, 'contain')
  assert.ok(placement.x >= viewport.x)
  assert.ok(placement.y >= viewport.y)
  assert.ok(placement.x + placement.width <= viewport.x + viewport.width)
  assert.ok(placement.y + placement.height <= viewport.y + viewport.height)
  assert.ok(Math.abs(placement.width / placement.height - image.naturalWidth / image.naturalHeight) < Number.EPSILON)
})
