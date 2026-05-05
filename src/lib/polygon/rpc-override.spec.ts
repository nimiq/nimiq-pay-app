import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POLYGON_RPC_OVERRIDE_KEY, setPolygonRpcOverride } from './rpc-override'

describe('polygon rpc override', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('writes a string override to localStorage', () => {
    setPolygonRpcOverride('https://polygon.drpc.org')
    expect(localStorage.getItem(POLYGON_RPC_OVERRIDE_KEY)).toBe('https://polygon.drpc.org')
  })

  it('removes the entry when passed null', () => {
    localStorage.setItem(POLYGON_RPC_OVERRIDE_KEY, 'https://polygon.drpc.org')
    setPolygonRpcOverride(null)
    expect(localStorage.getItem(POLYGON_RPC_OVERRIDE_KEY)).toBeNull()
  })
})
