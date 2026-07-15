import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('configures a native Android 13:37 Wi-Fi status bar', async () => {
  const fastfile = await readFile(new URL('../../Fastfile', import.meta.url), 'utf8')
  assert.match(fastfile, /settings put system time_12_24 24/)
  assert.match(fastfile, /command network -e wifi show -e level 4 -e fully true/)
  assert.match(fastfile, /command network -e mobile hide/)
})
