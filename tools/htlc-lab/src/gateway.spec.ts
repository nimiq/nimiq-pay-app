import { describe, expect, it, vi } from 'vitest'
import { CoreGateway, transactionState } from './gateway'

const words = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('chain execution evidence', () => {
  it('does not infer success from inclusion without an execution result', () => {
    expect(transactionState({ state: 'confirmed' })).toBe('unknown')
    expect(transactionState({ state: 'included' })).toBe('unknown')
    expect(transactionState({ state: 'confirmed', executionResult: true })).toBe('confirmed')
    expect(transactionState({ state: 'included', executionResult: true })).toBe('included')
    expect(transactionState({ state: 'confirmed', executionResult: false })).toBe('failed')
    expect(transactionState({ state: 'expired' })).toBe('failed')
    expect(transactionState({ state: 'invalidated' })).toBe('failed')
    expect(transactionState({ state: 'new' })).toBe('pending')
  })

  it('finds old A beyond multiple history pages and rejects wrong ordering', async () => {
    const gateway = new CoreGateway()
    const spam = Array.from({ length: 250 }, (_, i) => `spam-${i}`)
    const hashes = ['b', ...spam, 'a']
    const getTransactionsByAddress = vi.fn(async (_owner: string, _height: unknown, _known: unknown, cursor: string | undefined) => {
      const start = cursor ? hashes.indexOf(cursor) + 1 : 0
      return hashes.slice(start, start + 100).map(transactionHash => ({ transactionHash, state: 'confirmed', executionResult: true }))
    })
    Reflect.set(gateway, 'client', { getTransactionsByAddress })
    expect(await gateway.historyDepth('owner', 'a', spam, 'b')).toBe(251)
    expect(getTransactionsByAddress).toHaveBeenCalledTimes(3)
    hashes.splice(0, 2, 'spam-0', 'b')
    await expect(gateway.historyDepth('owner', 'a', spam, 'b')).rejects.toThrow('newer than B')
  })

  it('rejects truncated history instead of treating it as complete evidence', async () => {
    const gateway = new CoreGateway()
    Reflect.set(gateway, 'client', { getTransactionsByAddress: async () => [{ transactionHash: 'b', state: 'confirmed', executionResult: true }] })
    await expect(gateway.historyDepth('owner', 'a', ['spam'], 'b')).rejects.toThrow('did not reach A')
  })

  it('rebroadcasts identical signed bytes and refuses an expired validity window', async () => {
    const gateway = new CoreGateway()
    gateway.importOwner(words)
    gateway.generateSpammer()
    const head = vi.spyOn(gateway, 'head').mockResolvedValue({ height: 100, timestamp: 1000 })
    const sendTransaction = vi.fn(async () => {})
    Reflect.set(gateway, 'client', { sendTransaction })
    const tx = await gateway.prepareReturn(100, 0)
    await gateway.broadcast(tx.hash)
    await gateway.rebroadcast(tx.hash)
    expect(sendTransaction.mock.calls[0]).toEqual(sendTransaction.mock.calls[1])
    head.mockResolvedValue({ height: 1000000, timestamp: 2000 })
    await expect(gateway.rebroadcast(tx.hash)).rejects.toThrow('validity window')
    await expect(gateway.rebroadcast('missing')).rejects.toThrow('not replayed')
    expect(sendTransaction).toHaveBeenCalledTimes(2)
  })
})

describe('spam wallet restoration', () => {
  it('derives the same address from generated recovery words', () => {
    const generated = new CoreGateway().generateSpammer()
    expect(new CoreGateway().importSpammer(generated.words)).toBe(generated.address)
  })
})

describe('normal transfer signing', () => {
  it('creates distinct signed deposits with the requested value and spam sender', async () => {
    const gateway = new CoreGateway()
    const owner = gateway.importOwner(words)
    const spam = gateway.generateSpammer()
    vi.spyOn(gateway, 'head').mockResolvedValue({ height: 100, timestamp: 1000 })
    const a = await gateway.prepareReturn(12345, 7)
    const b = await gateway.prepareReturn(12345, 7)
    expect(a).toMatchObject({ sender: spam.address, recipient: owner, value: 12345, fee: 7 })
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('client listener lifecycle', () => {
  it('listens for heads and account transactions, and removes old handles on replacement', async () => {
    const gateway = new CoreGateway()
    let head!: (hash: string, reason: string) => void
    let transaction!: () => void
    const client = {
      addHeadChangedListener: vi.fn(async (callback) => {
        head = callback
        return 1
      }),
      addTransactionListener: vi.fn(async (callback) => {
        transaction = callback
        return 2
      }),
      addConsensusChangedListener: vi.fn(async () => 3),
      removeListener: vi.fn(async () => {}),
    }
    Reflect.set(gateway, 'client', client)
    const changed = vi.fn()
    await gateway.listen(['owner', 'spam'], changed)
    expect(client.addTransactionListener).toHaveBeenCalledWith(expect.any(Function), ['owner', 'spam'])
    changed.mockClear()
    head('hash', 'extended')
    expect(changed.mock.calls).toEqual([['head']])
    transaction()
    expect(changed).toHaveBeenLastCalledWith('balances')
    const oldHead = head
    await gateway.listen(['owner', 'spam', 'contract'], changed)
    expect(client.removeListener.mock.calls).toEqual([[1], [2], [3]])
    changed.mockClear()
    oldHead('old', 'extended')
    expect(changed).not.toHaveBeenCalled()
    await gateway.stopListening()
    expect(client.removeListener).toHaveBeenCalledTimes(6)
  })

  it('removes a listener whose registration finishes after teardown', async () => {
    const gateway = new CoreGateway()
    let resolve!: (id: number) => void
    const client = {
      addHeadChangedListener: vi.fn(() => new Promise<number>((done) => {
        resolve = done
      })),
      removeListener: vi.fn(async () => {}),
    }
    Reflect.set(gateway, 'client', client)
    const subscribing = gateway.listen(['owner'], vi.fn())
    await vi.waitFor(() => expect(client.addHeadChangedListener).toHaveBeenCalled())
    await gateway.stopListening()
    resolve(7)
    await subscribing
    expect(client.removeListener).toHaveBeenCalledWith(7)
  })
})

describe('existing HTLC discovery', () => {
  it('scans beyond the first page and follows drained extension contracts, ignoring foreign ownership', async () => {
    const gateway = new CoreGateway()
    const owner = gateway.importOwner(words)
    const drained = new CoreGateway().generateSpammer().address
    const funded = new CoreGateway().generateSpammer().address
    const foreign = new CoreGateway().generateSpammer().address
    const creation = (recipient: string, sender = owner) => ({ transactionHash: recipient, recipient, recipientType: 'htlc', executionResult: true, data: { type: 'htlc', sender, timeout: 1234 } })
    const getTransactionsByAddress = vi.fn(async (address: string, _height: unknown, _known: unknown, cursor?: string) => {
      if (address === owner)
        return cursor ? [creation(drained), creation(foreign, foreign)] : Array.from({ length: 100 }, (_, i) => ({ transactionHash: `receipt-${i}`, recipientType: 'basic' }))
      return address === drained ? [creation(funded)] : []
    })
    Reflect.set(gateway, 'client', {
      getTransactionsByAddress,
      getAccount: async (address: string) => address === drained ? { type: 'basic', balance: 0 } : { type: 'htlc', sender: address === foreign ? foreign : owner, balance: 500, timeout: 1234 },
    })
    expect(await gateway.discoverHtlcs(owner)).toEqual([{ address: funded, balance: 500, expiry: 1234 }])
    expect(await gateway.discoverHtlcs(owner, true)).toEqual([
      { address: drained, balance: 0, expiry: 1234 },
      { address: funded, balance: 500, expiry: 1234 },
    ])
    expect(getTransactionsByAddress).toHaveBeenCalledWith(owner, undefined, undefined, 'receipt-99', 100)
    expect(getTransactionsByAddress).toHaveBeenCalledWith(drained, undefined, undefined, undefined, 100)
  })

  it('rejects repeated history cursors instead of treating a partial scan as clear', async () => {
    const gateway = new CoreGateway()
    const owner = gateway.importOwner(words)
    Reflect.set(gateway, 'client', { getTransactionsByAddress: async () => Array.from({ length: 100 }, (_, i) => ({ transactionHash: `receipt-${i}`, recipientType: 'basic' })) })
    await expect(gateway.discoverHtlcs(owner)).rejects.toThrow('could not complete history pagination')
  })
})
