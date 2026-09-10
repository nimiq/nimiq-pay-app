import type { Gateway, Prepared, TxState } from './model'
import { describe, expect, it, vi } from 'vitest'
import { LabEngine } from './engine'
import { initialState } from './model'

function setup() {
  const state = initialState()
  Object.assign(state, { connected: true, owner: 'owner', spammer: 'spammer' })
  let sequence = 0
  let timestamp = Date.now()
  let pollTime = Date.now()
  const statuses = new Map<string, TxState>()
  const balances = new Map<string, number>([['owner', 10000], ['spammer', 10000]])
  const prepared = (recipient: string, value = 100): Prepared => ({ hash: `hash-${++sequence}`, sender: 'owner', recipient, value, fee: 0, validityStartHeight: 100 })
  const gateway: Gateway = {
    discoverHtlcs: vi.fn(async () => []),
    head: async () => ({ height: 100, timestamp }),
    balance: async address => balances.get(address) ?? 100,
    registered: async () => true,
    prepareHtlc: async () => prepared(`contract-${sequence}`),
    prepareSpam: async () => prepared('owner', 1),
    prepareDrain: async () => prepared('owner'),
    prepareReturn: async () => prepared('owner'),
    broadcast: vi.fn(async () => {}),
    rebroadcast: vi.fn(async () => {}),
    transaction: async hash => statuses.get(hash) ?? 'pending',
    historyDepth: vi.fn(async () => 251),
  }
  const engine = new LabEngine(state, gateway, () => 0)
  return {
    state,
    gateway,
    engine,
    statuses,
    balances,
    tick: () => {
      // Simulate the client head/account notifications that precede this check.
      engine.notifyChainChanged('head')
      engine.notifyChainChanged('balances')
      return engine.tick(pollTime += 4000)
    },
    expire: () => { timestamp += 400000 },
    confirm: () => {
      state.transactions.forEach(tx => statuses.set(tx.hash, 'confirmed'))
    },
  }
}

const config = { scenario: 'bomb' as const, amount: 100, fee: 0, expiryMinutes: 5, count: 3 }

describe('scenario ordering and submission barriers', () => {
  it('requires expiry, all confirmed spam, then B before app observation', async () => {
    const t = setup()
    await t.engine.start(config)
    await expect(t.engine.advance()).rejects.toThrow()
    t.confirm()
    await t.tick()
    expect(t.state.stage).toBe('waiting-expiry')
    t.expire()
    await t.tick()
    expect(t.state.stage).toBe('ready-spam')
    await t.engine.advance()
    for (let i = 0; i < 3; i++) await t.engine.tick(10000 + i * 1000)
    expect(t.state.transactions.filter(tx => tx.kind === 'spam')).toHaveLength(3)
    expect(t.state.stage).toBe('spamming')
    await expect(t.engine.advance()).rejects.toThrow()
    t.confirm()
    await t.tick()
    expect(t.state.stage).toBe('ready-new')
    await t.engine.advance()
    expect(t.state.stage).toBe('funding-b')
    t.confirm()
    await t.tick()
    expect(t.state.stage).toBe('observe')
    expect(t.gateway.historyDepth).toHaveBeenCalledOnce()
  })

  it('keeps uncertain broadcasts tracked and never submits replacements', async () => {
    const t = setup()
    t.gateway.broadcast = vi.fn(async () => {
      throw new Error('timeout')
    })
    await t.engine.start(config)
    expect(t.state.transactions[0].state).toBe('unknown')
    await t.tick()
    await expect(t.engine.start(config)).rejects.toThrow()
    expect(t.gateway.broadcast).toHaveBeenCalledOnce()
  })

  it('does not block the runner on a slow broadcast or downgrade an already confirmed hash', async () => {
    const t = setup()
    let finish!: () => void
    t.gateway.broadcast = () => new Promise<void>((resolve) => {
      finish = resolve
    })
    await t.engine.start(config)
    expect(t.state.transactions[0].state).toBe('unknown')
    t.confirm()
    await t.tick()
    expect(t.state.transactions[0].state).toBe('confirmed')
    finish()
    await Promise.resolve()
    expect(t.state.transactions[0].state).toBe('confirmed')
  })

  it('rechecks before rebroadcast and keeps the same hash and transaction count', async () => {
    const t = setup()
    await t.engine.start(config)
    const hash = t.state.transactions[0].hash
    await t.engine.retry(hash)
    expect(t.gateway.rebroadcast).toHaveBeenCalledWith(hash)
    expect(t.state.transactions).toHaveLength(1)
    t.statuses.set(hash, 'confirmed')
    await t.engine.retry(hash)
    expect(t.gateway.rebroadcast).toHaveBeenCalledOnce()
    expect(t.state.transactions[0].state).toBe('confirmed')
  })

  it('releases the configuration after a pre-broadcast setup failure', async () => {
    const t = setup()
    t.gateway.prepareHtlc = async () => {
      throw new Error('Cosigner unavailable')
    }
    await expect(t.engine.start(config)).rejects.toThrow('Cosigner unavailable')
    expect(t.state.config).toBeNull()
    expect(t.state.runId).toBe('')
    expect(t.state.stage).toBe('idle')
    expect(t.gateway.broadcast).not.toHaveBeenCalled()
  })

  it('pauses and cancels new spam but still reconciles submitted hashes', async () => {
    const t = setup()
    await t.engine.start(config)
    t.confirm()
    t.expire()
    await t.tick()
    await t.engine.advance()
    await t.engine.tick(10000)
    t.state.paused = true
    await t.engine.tick(11000)
    expect(t.state.transactions.filter(tx => tx.kind === 'spam')).toHaveLength(1)
    t.engine.cancel()
    t.confirm()
    await t.tick()
    expect(t.state.transactions.every(tx => tx.state === 'confirmed')).toBe(true)
    expect(t.state.stage).toBe('cancelled')
    await expect(t.engine.advance()).rejects.toThrow()
  })

  it('enforces rate and unresolved limits and includes all fees in funding checks', async () => {
    const t = setup()
    t.balances.set('owner', 201)
    await expect(t.engine.start({ ...config, fee: 1 })).rejects.toThrow('funds')
    t.balances.set('owner', 10000)
    await t.engine.start({ ...config, count: 30 })
    t.confirm()
    t.expire()
    await t.tick()
    await t.engine.advance()
    await t.engine.tick(10000)
    await t.engine.tick(10001)
    expect(t.state.transactions.filter(tx => tx.kind === 'spam')).toHaveLength(1)
    for (let i = 1; i < 35; i++) await t.engine.tick(10000 + i * 500)
    expect(t.state.transactions.filter(tx => tx.kind === 'spam')).toHaveLength(20)
  })

  it('blocks cleanup during observation and never drains arbitrary addresses', async () => {
    const t = setup()
    await t.engine.start(config)
    await expect(t.engine.cleanup('foreign')).rejects.toThrow()
    t.confirm()
    await t.tick()
    t.state.observing = true
    await expect(t.engine.cleanup(t.state.contracts[0].address)).rejects.toThrow()
  })

  it('leaves a submission window after a slow listener refresh', async () => {
    const t = setup()
    await t.engine.start(config)
    t.confirm()
    t.expire()
    await t.tick()
    await t.engine.advance()
    let now = 10000
    const head = t.gateway.head
    t.gateway.head = vi.fn(async () => {
      now += 4000
      return head()
    })
    const engine = new LabEngine(t.state, t.gateway, () => now)
    engine.notifyChainChanged('head')
    await engine.tick()
    now += 500
    await engine.tick()
    expect(t.gateway.head).toHaveBeenCalledOnce()
    expect(t.state.transactions.filter(tx => tx.kind === 'spam')).toHaveLength(2)
  })

  it('stops on failed spam and exports public evidence only', async () => {
    const t = setup()
    await t.engine.start(config)
    t.confirm()
    t.expire()
    await t.tick()
    await t.engine.advance()
    await t.engine.tick(10000)
    t.statuses.set(t.state.transactions[1].hash, 'failed')
    await t.tick()
    expect(t.state.stage).toBe('failed')
    expect(t.state.transactions).toHaveLength(2)
    const report = JSON.stringify(t.engine.report())
    expect(report).not.toMatch(/privateKey|mnemonic|words|rawTx/)
    expect(report).toContain('not-checked')
  })

  it.each(['two', 'drained', 'expired'] as const)('completes %s only after the expected chain state', async (scenario) => {
    const t = setup()
    await t.engine.start({ ...config, scenario })
    t.confirm()
    await t.tick()
    if (scenario === 'expired') {
      expect(t.state.stage).toBe('waiting-expiry')
      t.expire()
    }
    else {
      if (scenario === 'drained') {
        expect(t.state.stage).toBe('ready-drain')
        await t.engine.advance()
        t.confirm()
        t.balances.set(t.state.contracts[0].address, 0)
        await t.tick()
      }
      expect(t.state.stage).toBe('ready-new')
      await t.engine.advance()
      t.confirm()
    }
    await t.tick()
    expect(t.state.stage).toBe('observe')
    expect(t.state.observing).toBe(true)
  })

  it('does not broadcast a prepared B after cancellation during a network await', async () => {
    const t = setup()
    await t.engine.start({ ...config, scenario: 'two' })
    t.confirm()
    await t.tick()
    let finish!: (tx: Prepared) => void
    t.gateway.prepareHtlc = () => new Promise((resolve) => {
      finish = resolve
    })
    const pending = t.engine.advance()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    t.engine.cancel()
    finish({ hash: 'cancelled-b', sender: 'owner', recipient: 'b', value: 100, fee: 0, validityStartHeight: 100 })
    await expect(pending).rejects.toThrow('cancelled')
    expect(t.gateway.broadcast).toHaveBeenCalledOnce()
    expect(t.state.stage).toBe('cancelled')
  })

  it('checks exact history ordering before declaring the bomb ready', async () => {
    const t = setup()
    await t.engine.start(config)
    t.confirm()
    t.expire()
    await t.tick()
    await t.engine.advance()
    for (let i = 0; i < 3; i++) await t.engine.tick(10000 + i * 1000)
    t.confirm()
    await t.tick()
    await t.engine.advance()
    t.confirm()
    t.gateway.historyDepth = async () => {
      throw new Error('History missing A')
    }
    await t.tick()
    expect(t.state.stage).toBe('checking')
    expect(t.state.observing).toBe(false)
    expect(t.state.error).toContain('History missing A')
  })
})

describe('normal deposits', () => {
  it('checks amount plus fee, tracks uncertain sends, and blocks duplicates and HTLC setup', async () => {
    const t = setup()
    t.gateway.prepareReturn = vi.fn(async (value, fee) => ({ hash: 'deposit', sender: 'spammer', recipient: 'owner', value, fee, validityStartHeight: 100 }))
    t.balances.set('spammer', 102)
    await expect(t.engine.deposit(100, 3)).rejects.toThrow('Insufficient')
    expect(t.gateway.prepareReturn).not.toHaveBeenCalled()
    t.balances.set('spammer', 103)
    t.gateway.broadcast = vi.fn(async () => {
      throw new Error('Uncertain')
    })
    await t.engine.deposit(100, 3)
    expect(t.gateway.prepareReturn).toHaveBeenCalledWith(100, 3)
    expect(t.state.transactions[0]).toMatchObject({ kind: 'deposit', sender: 'spammer', recipient: 'owner', value: 100, fee: 3 })
    await expect(t.engine.deposit(1, 0)).rejects.toThrow('pending deposit')
    await expect(t.engine.start(config)).rejects.toThrow('clear the deposit session')
    t.confirm()
    await t.tick()
    expect(t.state.transactions[0].state).toBe('confirmed')
    expect(t.engine.report().transactions[0]).toMatchObject({ kind: 'deposit', value: 0.001, fee: 3 })
    expect(t.engine.report().units).toEqual({ amounts: 'NIM', fees: 'Luna' })
    expect(t.state.stage).toBe('idle')
  })

  it('rejects deposits during HTLC runs, from the same wallet, and with invalid amounts', async () => {
    const t = setup()
    t.state.stage = 'observe'
    await expect(t.engine.deposit(1, 0)).rejects.toThrow('Finish the HTLC')
    t.state.stage = 'idle'
    t.state.spammer = t.state.owner
    await expect(t.engine.deposit(1, 0)).rejects.toThrow('separate spam wallet')
    t.state.spammer = 'spammer'
    await expect(t.engine.deposit(0.1, 0)).rejects.toThrow('positive NIM')
    await expect(t.engine.deposit(1, -1)).rejects.toThrow('positive NIM')
  })
})

describe('listener-driven snapshots', () => {
  it('does not poll heads or balances on idle scheduler ticks', async () => {
    const t = setup()
    const head = vi.spyOn(t.gateway, 'head')
    const balance = vi.spyOn(t.gateway, 'balance')
    await t.engine.tick(4000)
    await t.engine.tick(8000)
    expect(head).not.toHaveBeenCalled()
    expect(balance).not.toHaveBeenCalled()
    t.engine.notifyChainChanged('head')
    await t.engine.tick(12000)
    expect(head).toHaveBeenCalledTimes(1)
    expect(balance).not.toHaveBeenCalled()
    t.engine.notifyChainChanged('balances')
    await t.engine.tick(16000)
    expect(balance).toHaveBeenCalledTimes(2)
  })

  it('keeps buttons unlocked during slow background account reads and coalesces overlapping ticks', async () => {
    const t = setup()
    let resolve!: (value: number) => void
    t.gateway.balance = vi.fn(() => new Promise<number>((done) => {
      resolve = done
    }))
    t.state.spammer = ''
    t.engine.notifyChainChanged('balances')
    const updating = t.engine.tick(4000)
    expect(t.state.busy).toBe(false)
    await t.engine.tick(4500)
    expect(t.gateway.balance).toHaveBeenCalledTimes(1)
    resolve(123)
    await updating
    expect(t.state.ownerBalance).toBe(123)
    expect(t.state.busy).toBe(false)
  })
})

describe('existing HTLC preflight', () => {
  it.each(['two', 'drained', 'expired', 'bomb'] as const)('claims old funds before starting %s', async (scenario) => {
    const t = setup()
    t.balances.set('owner', 0)
    t.balances.set('old', 501)
    t.gateway.discoverHtlcs = vi.fn().mockResolvedValueOnce([{ address: 'old', balance: 501, expiry: 1 }]).mockResolvedValue([])
    t.gateway.prepareDrain = vi.fn(async (address, value, fee) => ({ hash: 'claim', sender: address, recipient: 'owner', value, fee, validityStartHeight: 100 }))
    const fund = vi.spyOn(t.gateway, 'prepareHtlc')
    await t.engine.start({ ...config, scenario, fee: 1 })
    expect(t.state.stage).toBe('ready-claim')
    expect(fund).not.toHaveBeenCalled()
    await t.engine.advance()
    expect(t.gateway.prepareDrain).toHaveBeenCalledWith('old', 500, 1, true)
    expect(t.state.stage).toBe('claiming-existing')
    await expect(t.engine.advance()).rejects.toThrow('Wait for all submitted')
    expect(fund).not.toHaveBeenCalled()
    t.confirm()
    await t.tick()
    expect(t.state.stage).toBe('claiming-existing')
    expect(t.state.error).toContain('not empty')
    t.balances.set('old', 0)
    t.balances.set('owner', 10000)
    await t.tick()
    expect(t.state.stage).toBe('ready-start')
    await t.engine.advance()
    expect(t.gateway.discoverHtlcs).toHaveBeenCalledTimes(2)
    expect(t.state.stage).toBe('funding-a')
    expect(t.engine.report().existingContracts[0].balance).toBe(0)
  })

  it('does not fund when discovery fails, or replace an uncertain existing claim', async () => {
    const t = setup()
    const fund = vi.spyOn(t.gateway, 'prepareHtlc')
    t.gateway.discoverHtlcs = vi.fn().mockRejectedValueOnce(new Error('Incomplete history')).mockResolvedValue([{ address: 'old', balance: 501, expiry: 1 }])
    await expect(t.engine.start(config)).rejects.toThrow('Incomplete history')
    expect(fund).not.toHaveBeenCalled()
    await t.engine.start(config)
    t.balances.set('old', 501)
    t.gateway.broadcast = vi.fn().mockRejectedValue(new Error('timeout'))
    await t.engine.advance()
    await expect(t.engine.advance()).rejects.toThrow('Wait for all submitted')
    expect(t.state.transactions).toHaveLength(1)
    expect(fund).not.toHaveBeenCalled()
  })
})
