import { describe, expect, it, vi } from 'vitest'

describe('fetchLogsWithAdaptiveRange', () => {
  it('splits oversized log queries into smaller ranges', async () => {
    const { fetchLogsWithAdaptiveRange } = await import('./history')
    const getLogs = vi.fn(async ({ fromBlock, toBlock }: { fromBlock: number, toBlock: number }) => {
      if (toBlock - fromBlock + 1 > 10_000) {
        throw new Error('ranges over 10000 blocks are not supported on freetier')
      }
      return [{ transactionHash: `${fromBlock}-${toBlock}` }]
    })

    const logs = await fetchLogsWithAdaptiveRange(
      { getLogs } as any,
      { address: '0x1', topics: [], fromBlock: 0, toBlock: 20_000 },
    )

    expect(logs).toHaveLength(3)
    expect(getLogs.mock.calls.length).toBeGreaterThan(1)
    expect(
      logs.every((log: { transactionHash: string }) => {
        const [fromBlock, toBlock] = log.transactionHash.split('-').map(Number)
        return (toBlock - fromBlock + 1) <= 10_000
      }),
    ).toBe(true)
  })

  it('splits timed out log queries into smaller ranges', async () => {
    const { fetchLogsWithAdaptiveRange } = await import('./history')
    const getLogs = vi.fn(async ({ fromBlock, toBlock }: { fromBlock: number, toBlock: number }) => {
      if (toBlock - fromBlock + 1 >= 3_000) {
        const error = new Error('could not coalesce error')
        ;(error as Error & { code?: string, info?: { error?: { code?: number, message?: string } } }).code = 'UNKNOWN_ERROR'
        ;(error as Error & { code?: string, info?: { error?: { code?: number, message?: string } } }).info = {
          error: {
            code: -32002,
            message: 'request timed out',
          },
        }
        throw error
      }
      return [{ transactionHash: `${fromBlock}-${toBlock}` }]
    })

    const logs = await fetchLogsWithAdaptiveRange(
      { getLogs } as any,
      { address: '0x1', topics: [], fromBlock: 0, toBlock: 2_999 },
    )

    expect(logs).toHaveLength(2)
    expect(getLogs.mock.calls.length).toBeGreaterThan(1)
    expect(
      logs.every((log: { transactionHash: string }) => {
        const [fromBlock, toBlock] = log.transactionHash.split('-').map(Number)
        return (toBlock - fromBlock + 1) < 3_000
      }),
    ).toBe(true)
  })
})
