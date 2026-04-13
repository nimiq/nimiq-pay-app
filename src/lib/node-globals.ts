// eslint-disable-next-line unicorn/prefer-node-protocol
import { Buffer } from 'buffer'
import process from 'process/browser.js'

type BrowserProcess = typeof process & {
  browser?: boolean
}

interface NodeGlobalsTarget {
  Buffer?: typeof Buffer
  global?: typeof globalThis
  process?: BrowserProcess
}

export function installNodeGlobals() {
  const target = globalThis as NodeGlobalsTarget

  target.global ??= globalThis
  // eslint-disable-next-line node/prefer-global/buffer
  target.Buffer ??= Buffer
  // eslint-disable-next-line node/prefer-global/process
  target.process ??= process
}
