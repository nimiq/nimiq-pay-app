import { Interface } from 'ethers'
import { describe, expect, it, vi } from 'vitest'
import {
  buildDescendingBlockRanges,
  buildRelayAddressUrl,
  createOpenGsnConfig,
  fetchRelayRegistrations,
} from './opengsn'

describe('polygon opengsn helpers', () => {
  it('normalizes relay getaddr endpoints', () => {
    expect(buildRelayAddressUrl('https://relay.example')).toBe('https://relay.example/getaddr')
    expect(buildRelayAddressUrl('https://relay.example/')).toBe('https://relay.example/getaddr')
  })

  it('fills config defaults', () => {
    const config = createOpenGsnConfig({
      relayHubAddress: '0x1111111111111111111111111111111111111111',
      networkId: 137,
    })

    expect(config.batchSizeBlocks).toBe(300)
    expect(config.maxLookbackBlocks).toBe(1800)
    expect(config.relayVersionPrefix).toBe('2.')
    expect(config.skipRecentActivityForSuffixes).toEqual(['.fastspot.io'])
  })

  it('builds descending ranges without crossing the lower bound', () => {
    expect(buildDescendingBlockRanges(100, 40, 20)).toEqual([
      { fromBlock: 80, toBlock: 100 },
      { fromBlock: 59, toBlock: 79 },
      { fromBlock: 40, toBlock: 58 },
    ])
  })

  it('retries relay registration queries at the highest log-queryable block', async () => {
    const relayHubInterface = new Interface([
      'event RelayServerRegistered(address indexed relayManager, uint256 baseRelayFee, uint256 pctRelayFee, string url)',
    ])
    const encodedLog = relayHubInterface.encodeEventLog(
      relayHubInterface.getEvent('RelayServerRegistered')!,
      [
        '0x750dD91B9948792C0850C83b059E9AbaeFa243c0',
        0n,
        70n,
        'https://gsn.main.fastspot.io',
      ],
    )
    const getLogs = vi.fn()
      .mockRejectedValueOnce(Object.assign(
        new Error(
          'block not found for eth_getLogs, requested toBlock 100 is not available '
          + 'on the upstream node (latestBlock: 99, finalizedBlock: 84)',
        ),
        {
          code: 'UNKNOWN_ERROR',
          error: {
            code: -32603,
            data: {
              code: 'ErrEndpointMissingData',
              details: {
                latestBlock: 99,
                finalizedBlock: 84,
              },
            },
          },
        },
      ))
      .mockResolvedValueOnce([
        {
          blockNumber: 99,
          topics: encodedLog.topics,
          data: encodedLog.data,
        },
      ])

    const registrations = await fetchRelayRegistrations(
      { getLogs } as any,
      '0x6C28AfC105e65782D9Ea6F2cA68df84C9e7d750d',
      0,
      100,
    )

    expect(getLogs).toHaveBeenCalledTimes(2)
    expect(getLogs.mock.calls[0][0]).toMatchObject({ fromBlock: 0, toBlock: 100 })
    expect(getLogs.mock.calls[1][0]).toMatchObject({ fromBlock: 0, toBlock: 99 })
    expect(registrations).toEqual([
      {
        relayManagerAddress: '0x750dD91B9948792C0850C83b059E9AbaeFa243c0',
        baseRelayFee: 0n,
        pctRelayFee: 70n,
        url: 'https://gsn.main.fastspot.io',
        blockNumber: 99,
      },
    ])
  })
})
