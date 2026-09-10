import type { Gateway, Prepared, TxState } from './model'
import type { Network } from './protocol'
import * as N from '@nimiq/core'
import { createDrain, createHtlc, createSpam, generateWallet, importWallet, validateNetwork } from './protocol'

interface Status { status: string, network: string, servicePublicKey: string }
interface WalletMetadata { address: string, servicePublicKey: string, serviceSignatureProofSize: number, validityStart: number, validityEnd: number }

async function withDeadline<T>(promise: Promise<T>, milliseconds = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Network operation timed out. Keep submitted hashes unresolved and retry only the check.')), milliseconds)
    })])
  }
  finally { clearTimeout(timer) }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) })
  if (!response.ok)
    throw new Error(`Service returned HTTP ${response.status}. Wait and retry the check; do not repeat an uncertain transfer.`)
  return response.json() as Promise<T>
}

export function transactionState(tx: Pick<N.PlainTransactionDetails, 'state' | 'executionResult'>): TxState {
  if (tx.executionResult === false || tx.state === 'expired' || tx.state === 'invalidated')
    return 'failed'
  if ((tx.state === 'confirmed' || tx.state === 'included') && tx.executionResult === true)
    return tx.state
  return tx.state === 'new' || tx.state === 'pending' ? 'pending' : 'unknown'
}

export class CoreGateway implements Gateway {
  private client?: N.Client
  private owner?: N.KeyPair
  private spammer?: N.KeyPair
  private network: Network = 'testnet'
  private networkId = 5
  private prepared = new Map<string, { tx: N.Transaction, cosigner: boolean }>()
  private listenerGeneration = 0
  private listenerHandles: { client: N.Client, id: number }[] = []

  async stopListening() {
    this.listenerGeneration++
    const handles = this.listenerHandles.splice(0)
    await Promise.all(handles.map(({ client, id }) => client.removeListener(id)))
  }

  async listen(addresses: string[], changed: (kind: 'head' | 'balances') => void) {
    const removing = this.stopListening()
    const generation = this.listenerGeneration
    await removing
    const client = this.client
    if (!client || generation !== this.listenerGeneration)
      return
    const registrations = [
      () => client.addHeadChangedListener((_hash, reason) => {
        if (generation !== this.listenerGeneration)
          return
        changed('head')
        if (reason === 'rebranched')
          changed('balances')
      }),
      () => client.addTransactionListener(() => {
        if (generation === this.listenerGeneration)
          changed('balances')
      }, addresses),
      () => client.addConsensusChangedListener(() => {
        if (generation === this.listenerGeneration) {
          changed('head')
          changed('balances')
        }
      }),
    ]
    try {
      for (const register of registrations) {
        const id = await register()
        // Reconnect/unmount may finish while core is still registering the listener.
        if (generation !== this.listenerGeneration) {
          await client.removeListener(id)
          return
        }
        this.listenerHandles.push({ client, id })
      }
      changed('head')
      changed('balances')
    }
    catch (error) {
      if (generation === this.listenerGeneration)
        await this.stopListening()
      throw error
    }
  }

  private pendingReads = new Map<string, Promise<unknown>>()

  private async read<T>(key: string, operation: () => Promise<T>): Promise<T> {
    let promise = this.pendingReads.get(key) as Promise<T> | undefined
    if (!promise) {
      promise = operation()
      this.pendingReads.set(key, promise)
      const current = promise
      void promise.finally(() => {
        if (this.pendingReads.get(key) === current)
          this.pendingReads.delete(key)
      }).catch(() => {})
    }
    // A timed-out WASM call can still be running. Reuse it instead of stacking duplicate reads.
    return withDeadline(promise)
  }

  importOwner(words: string) {
    this.owner = importWallet(words)
    return this.owner.toAddress().toUserFriendlyAddress()
  }

  importSpammer(words: string) {
    this.spammer = importWallet(words)
    return this.spammer.toAddress().toUserFriendlyAddress()
  }

  generateSpammer() {
    const wallet = generateWallet()
    this.spammer = wallet.key
    return { address: wallet.key.toAddress().toUserFriendlyAddress(), words: wallet.words }
  }

  private get endpoint() { return `/cosigner/${this.network}` }

  async connect(network: Network) {
    await this.stopListening()
    if (this.client)
      await this.client.disconnectNetwork()
    this.network = network
    this.pendingReads.clear()
    const config = new N.ClientConfiguration()
    config.network(network === 'testnet' ? 'TestAlbatross' : 'MainAlbatross')
    if (network === 'testnet') {
      config.seedNodes([
        '/dns4/seed1.pos.nimiq-testnet.com/tcp/8443/wss',
        '/dns4/seed2.pos.nimiq-testnet.com/tcp/8443/wss',
        '/dns4/seed3.pos.nimiq-testnet.com/tcp/8443/wss',
        '/dns4/seed4.pos.nimiq-testnet.com/tcp/8443/wss',
      ])
    }
    config.syncMode('pico')
    const pendingClient = N.Client.create(config.build())
    let client: N.Client
    try {
      client = await withDeadline(pendingClient, 30000)
    }
    catch (error) {
      void pendingClient.then(late => late.disconnectNetwork()).catch(() => {})
      throw error
    }
    this.client = client
    try {
      await withDeadline(client.waitForConsensusEstablished(), 60000)
      this.networkId = await client.getNetworkId()
      await this.status()
    }
    catch (error) {
      await client.disconnectNetwork()
      this.client = undefined
      throw error
    }
  }

  private async status() {
    const status = await request<Status>(`${this.endpoint}/status`)
    validateNetwork(this.network, this.networkId, status.network)
    if (status.status !== 'good')
      throw new Error('Cosigner is not ready. Wait for its consensus to recover.')
    return status
  }

  async head() {
    return this.read('head', async () => {
      const client = this.client
      if (!client || !await client.isConsensusEstablished())
        throw new Error('Client has no consensus. Keep this page open and wait for connectivity.')
      const block = await client.getHeadBlock()
      return { height: block.height, timestamp: block.timestamp }
    })
  }

  async balance(address: string) {
    const account = await this.read(`account:${address}`, () => this.client!.getAccount(address))
    return account.balance
  }

  async registered(address: string) {
    const response = await fetch(`${this.endpoint}/wallet/${encodeURIComponent(address)}`, { signal: AbortSignal.timeout(20000) })
    if (response.status === 404 || response.status === 409)
      return false
    if (!response.ok)
      throw new Error(`Cosigner wallet check failed (HTTP ${response.status}).`)
    const wallet = await response.json() as WalletMetadata
    return N.Address.fromString(wallet.address).equals(N.Address.fromString(address))
  }

  private remember(tx: N.Transaction, cosigner = false): Prepared {
    const hash = tx.hash()
    if (this.prepared.has(hash))
      throw new Error('Duplicate signed transaction blocked.')
    this.prepared.set(hash, { tx, cosigner })
    return { hash, sender: tx.sender.toUserFriendlyAddress(), recipient: tx.recipient.toUserFriendlyAddress(), value: Number(tx.value), fee: Number(tx.fee), validityStartHeight: tx.validityStartHeight }
  }

  async prepareHtlc(value: number, fee: number, expiry: number) {
    const status = await this.status()
    const head = await this.head()
    return this.remember(createHtlc({ owner: this.owner!, publicKey: status.servicePublicKey, value, fee, expiry, height: head.height + 1, networkId: this.networkId }))
  }

  async prepareSpam(runId: string, index: number, fee: number) {
    const head = await this.head()
    return this.remember(createSpam(this.spammer!, this.owner!.toAddress().toUserFriendlyAddress(), runId, index, fee, head.height + 1, this.networkId))
  }

  async prepareDrain(address: string, value: number, fee: number, expired: boolean) {
    const head = await this.head()
    const account = await this.read(`account:${address}`, () => this.client!.getAccount(address))
    if (account.type !== 'htlc' || !N.Address.fromString(account.sender).equals(this.owner!.toAddress()) || account.balance !== value + fee)
      throw new Error('HTLC owner or live balance changed. Refresh before cleanup.')
    if (expired) {
      if (head.timestamp <= account.timeout)
        throw new Error('Chain time has not passed this contract’s expiry.')
      return this.remember(createDrain(this.owner!, address, value, fee, head.height + 1, this.networkId))
    }
    await this.status()
    const wallet = await request<WalletMetadata>(`${this.endpoint}/wallet/${encodeURIComponent(address)}`)
    if (!N.Address.fromString(wallet.address).equals(N.Address.fromString(address))
      || !N.PublicKey.fromHex(wallet.servicePublicKey).toAddress().equals(N.Address.fromString(account.recipient))) {
      throw new Error('Cosigner metadata does not match this HTLC.')
    }
    if (!Number.isInteger(wallet.serviceSignatureProofSize) || wallet.serviceSignatureProofSize < 1 || wallet.serviceSignatureProofSize > 4096)
      throw new Error('Invalid cosigner signature proof size.')
    if (head.height + 1 < wallet.validityStart)
      throw new Error(`Cosigner spending starts at block ${wallet.validityStart}. Wait for that block, then continue.`)
    return this.remember(createDrain(this.owner!, address, value, fee, head.height + 1, this.networkId, wallet.serviceSignatureProofSize), true)
  }

  async prepareReturn(value: number, fee: number) {
    const head = await this.head()
    // Repeated equal deposits in one block must still have distinct hashes.
    const data = new TextEncoder().encode(`htlc-lab:transfer:${crypto.randomUUID()}`)
    const tx = N.TransactionBuilder.newBasicWithData(this.spammer!.toAddress(), this.owner!.toAddress(), data, BigInt(value), BigInt(fee), head.height + 1, this.networkId)
    tx.sign(this.spammer!, undefined)
    return this.remember(tx)
  }

  async broadcast(hash: string) {
    const prepared = this.prepared.get(hash)
    if (!prepared)
      throw new Error('Signed transaction is not available in this session.')
    if (prepared.cosigner) {
      // The cosigner broadcasts. Even txSent:false can mean an RPC timeout after submission.
      await request(`${this.endpoint}/wallet/${encodeURIComponent(prepared.tx.sender.toUserFriendlyAddress())}/send-raw-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: prepared.tx.toHex(),
      })
    }
    else {
      await withDeadline(this.client!.sendTransaction(prepared.tx.toHex()))
    }
  }

  async transaction(hash: string) {
    return transactionState(await this.read(`tx:${hash}`, () => this.client!.getTransaction(hash)))
  }

  async rebroadcast(hash: string) {
    const prepared = this.prepared.get(hash)
    if (!prepared || prepared.cosigner)
      throw new Error('Cosigner requests are not replayed. Inspect their original hash and server state.')
    const head = await this.head()
    if (head.height >= prepared.tx.validityStartHeight + N.Policy.TRANSACTION_VALIDITY_WINDOW_BLOCKS)
      throw new Error('The signed transaction validity window has ended. Export the report; no replacement was created.')
    await this.broadcast(hash)
  }

  async discoverHtlcs(owner: string, includeEmpty = false) {
    const ownerAddress = N.Address.fromString(owner)
    const pending = [owner]
    const visited = new Set<string>()
    const contracts = new Map<string, { address: string, expiry: number, balance: number }>()
    // Follow drained extension contracts too: the current HTLC may only occur in their history.
    while (pending.length) {
      const address = pending.shift()!
      if (visited.has(address))
        continue
      visited.add(address)
      if (visited.size > 1000)
        throw new Error('HTLC discovery exceeded 1,000 addresses. No new test was started.')
      let cursor: string | undefined
      const cursors = new Set<string>()
      for (;;) {
        const page = await this.read(`history:${address}:${cursor ?? ''}`, () => this.client!.getTransactionsByAddress(address, undefined, undefined, cursor, 100))
        for (const tx of page) {
          if (tx.recipientType !== 'htlc' || tx.executionResult === false)
            continue
          const account = await this.read(`account:${tx.recipient}`, () => this.client!.getAccount(tx.recipient))
          const liveOwner = account.type === 'htlc' && N.Address.fromString(account.sender).equals(ownerAddress)
          const historicalOwner = tx.data.type === 'htlc' && N.Address.fromString(tx.data.sender).equals(ownerAddress)
          if (!liveOwner && !historicalOwner)
            continue
          if (!visited.has(tx.recipient))
            pending.push(tx.recipient)
          if ((liveOwner && account.type === 'htlc' && account.balance > 0) || includeEmpty) {
            contracts.set(tx.recipient, {
              address: tx.recipient,
              expiry: account.type === 'htlc' ? account.timeout : tx.data.type === 'htlc' ? tx.data.timeout : 0,
              balance: account.balance,
            })
          }
        }
        if (page.length < 100)
          break
        cursor = page.at(-1)?.transactionHash
        if (!cursor || cursors.has(cursor) || cursors.size >= 10000)
          throw new Error('HTLC discovery could not complete history pagination. No new test was started.')
        cursors.add(cursor)
      }
    }
    return [...contracts.values()]
  }

  async historyDepth(owner: string, oldHash: string, spamHashes: string[], newHash: string) {
    const seen = new Set<string>()
    const foundSpam = new Set<string>()
    const expectedSpam = new Set(spamHashes)
    const cursors = new Set<string>()
    let cursor: string | undefined
    let foundNew = false
    while (true) {
      const page = await this.read(`history:${owner}:${cursor ?? ''}`, () => this.client!.getTransactionsByAddress(owner, undefined, undefined, cursor, 100))
      for (const tx of page) {
        if (seen.has(tx.transactionHash))
          continue
        if (tx.transactionHash === oldHash) {
          if (!foundNew || foundSpam.size !== expectedSpam.size)
            throw new Error('History ordering failed: not all spam lies between B and A.')
          return seen.size
        }
        seen.add(tx.transactionHash)
        if (tx.transactionHash === newHash)
          foundNew = true
        if (expectedSpam.has(tx.transactionHash)) {
          if (!foundNew || transactionState(tx) !== 'confirmed')
            throw new Error('Spam appears newer than B or is not successfully confirmed.')
          foundSpam.add(tx.transactionHash)
        }
      }
      cursor = page.at(-1)?.transactionHash
      if (page.length < 100 || !cursor || cursors.has(cursor))
        throw new Error('History scan did not reach A. Keep the app closed and retry after history becomes available.')
      cursors.add(cursor)
    }
  }

  async faucet(address: string) {
    if (this.network !== 'testnet')
      throw new Error('Faucet is testnet only. Fund the displayed address manually on mainnet.')
    const result = await request<{ success: boolean, error?: string, wait?: number }>('/faucet/tapit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })
    if (!result.success) {
      const messages: Record<string, string> = {
        RATE_LIMIT: `Faucet rate limit. Wait ${Math.ceil((result.wait ?? 0) / 60)} minutes or fund manually.`,
        GEOBLOCKED: 'Faucet unavailable in this region. Fund the address manually.',
        OUT_OF_FUNDS: 'Faucet is empty. Fund the address manually.',
      }
      throw new Error(messages[result.error ?? ''] ?? 'Faucet could not send funds. Check the balance before requesting again.')
    }
  }
}
