import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('keeps the supplied Figma background geometry and colors', async () => {
  const svg = await readFile(new URL('./background.svg', import.meta.url), 'utf8')
  assert.match(svg, /viewBox="0 0 1242 2208"/)
  assert.equal(svg.match(/<path/g)?.length, 3)
  assert.match(svg, /#265DD7/)
  assert.match(svg, /#0582CA/)
  assert.match(svg, /paint0_radial_188_2949/)
  assert.match(svg, /paint1_radial_188_2949/)
})
