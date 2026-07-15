import assert from 'node:assert/strict'
import test from 'node:test'
import { concepts, formats, getExportRelativePath, getPreview } from './config.mjs'

test('defines twenty previews with exact output sizes', () => {
  assert.equal(formats.length * concepts.length, 20)
  assert.deepEqual(formats.map(({ width, height }) => [width, height]), [
    [1242, 2688],
    [1284, 2778],
    [1242, 2688],
    [1668, 2420],
    [1080, 1920],
  ])
})

test('maps previews to fixed project paths', () => {
  assert.equal(
    getPreview('ios-67', 'nim').source,
    'fastlane/screenshots/en-US/iPhone 15 Pro Max-0HomeScreen.png',
  )
  assert.equal(
    getPreview('android', 'mini-apps').source,
    'fastlane/screenshots/android/en-US/Phone-3MiniApps.png',
  )
  assert.equal(
    getExportRelativePath('ios-65', 'usdt'),
    'ios-65/1-pay-with-usdt.png',
  )
  assert.throws(() => getPreview('../bad', 'nim'), /Unknown preview/)
})

test('keeps fixed Figma title line breaks', () => {
  assert.deepEqual(getPreview('ios-67', 'nim').titleLines, ['Pay with', 'NIM'])
  assert.deepEqual(getPreview('android', 'top-up').titleLines, ['Fund and withdraw', 'anytime'])
})

test('uses the native Android screenshot ratio and fits the whole image', () => {
  const preview = getPreview('android', 'usdt')
  assert.equal(preview.sourceAspect, 1344 / 2992)
  assert.equal(preview.imageFit, 'contain')
  assert.equal(preview.statusBarTime, undefined)
})
