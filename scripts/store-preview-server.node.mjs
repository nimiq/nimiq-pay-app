import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveExportPath, validatePng } from './store-preview-server.mjs'

test('resolves only configured export paths inside the project output directory', () => {
  assert.equal(
    resolveExportPath('/project', 'ios-67', 'nim'),
    '/project/fastlane/screenshots/previews/exports/ios-67/0-pay-with-nim.png',
  )
  assert.throws(() => resolveExportPath('/project', '../bad', 'nim'), /Unknown preview/)
})

test('accepts PNG bytes and rejects other payloads', () => {
  assert.doesNotThrow(() => validatePng(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])))
  assert.throws(() => validatePng(Buffer.from('not a png')), /Invalid PNG/)
})
