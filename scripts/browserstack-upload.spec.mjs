// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'

let temporaryDirectory

afterEach(() => {
  if (temporaryDirectory)
    rmSync(temporaryDirectory, { recursive: true, force: true })
})

it('passes shell metacharacters in checkout paths and credentials literally to curl', () => {
  temporaryDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'browserstack-upload-')))
  const checkout = join(temporaryDirectory, 'checkout $(printf changed) \'quote\'')
  const scripts = join(checkout, 'scripts')
  const builds = join(checkout, 'builds/android')
  const binaries = join(temporaryDirectory, 'bin')
  const capturedArgs = join(temporaryDirectory, 'args.json')
  for (const directory of [scripts, builds, binaries])
    mkdirSync(directory, { recursive: true })

  copyFileSync(new URL('./browserstack-upload.js', import.meta.url), join(scripts, 'browserstack-upload.js'))
  writeFileSync(join(checkout, 'package.json'), JSON.stringify({ type: 'module', version: '1.0.0' }))
  const build = join(builds, 'NimiqPay-1.0.0.aab')
  writeFileSync(build, 'test build')
  // Capture the actual process arguments without sending credentials or builds to BrowserStack.
  writeFileSync(join(binaries, 'curl'), `#!${process.execPath}
require('node:fs').writeFileSync(process.env.TEST_CURL_ARGS, JSON.stringify(process.argv.slice(2)));
process.stdout.write(JSON.stringify({ app_url: 'bs://test' }));
`, { mode: 0o755 })

  const username = 'user-$(printf changed)'
  const accessKey = 'key-`printf changed`'
  const result = spawnSync(process.execPath, [join(scripts, 'browserstack-upload.js')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: [binaries, dirname(process.execPath), process.env.PATH].join(delimiter),
      BROWSERSTACK_USERNAME: username,
      BROWSERSTACK_ACCESS_KEY: accessKey,
      TEST_CURL_ARGS: capturedArgs,
    },
  })

  expect(result.status).toBe(0)
  expect(existsSync(capturedArgs)).toBe(true)
  expect(JSON.parse(readFileSync(capturedArgs, 'utf8'))).toEqual([
    '-u',
    `${username}:${accessKey}`,
    '-X',
    'POST',
    'https://api-cloud.browserstack.com/app-automate/upload',
    '-F',
    `file=@${build}`,
    '-F',
    'custom_id=NimiqPayAndroid',
  ])
  expect(result.stdout).toContain('Successfully uploaded NimiqPay-1.0.0.aab')
})
