// Builds the injected Mini Apps provider from the pinned trust-web3-provider submodule.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vendor = join(root, 'vendor/trust-web3-provider')
// Bun comes from the pinned devDependency, not a global install.
const bun = join(root, 'node_modules/.bin/bun')

if (!existsSync(join(vendor, 'package.json'))) {
  console.error('🚫 vendor/trust-web3-provider is missing. Run: git submodule update --init --recursive')
  process.exit(1)
}

function run(command, args, cwd) {
  try {
    execFileSync(command, args, { cwd, stdio: 'inherit' })
  }
  catch {
    // The child already printed its error; skip Node's stack trace.
    console.error(`🚫 Failed: ${command} ${args.join(' ')} (in ${cwd})`)
    process.exit(1)
  }
}

run(bun, ['install', '--frozen-lockfile'], vendor)
// Core must exist before nimiq and ethereum resolve it.
for (const pkg of ['core', 'nimiq', 'ethereum']) {
  const cwd = join(vendor, 'packages', pkg)
  run(bun, ['run', 'build:clean'], cwd)
  run(bun, ['run', 'rollup', '--config', './rollup.config.js'], cwd)
  run(bun, ['run', 'build:types'], cwd)
}

const provider = join(root, 'web3-provider')
run('pnpm', ['install', '--frozen-lockfile'], provider)
run('pnpm', ['typecheck'], provider)
run('pnpm', ['build'], provider)
