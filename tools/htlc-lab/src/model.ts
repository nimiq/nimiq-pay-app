import type { Network } from './protocol'

export type Scenario = 'two' | 'drained' | 'expired' | 'bomb'
export type Stage = 'idle' | 'ready-claim' | 'claiming-existing' | 'ready-start' | 'funding-a' | 'ready-drain' | 'draining-a' | 'waiting-expiry' | 'ready-spam' | 'spamming' | 'ready-new' | 'funding-b' | 'checking' | 'observe' | 'cancelled' | 'failed'
export type TxState = 'unknown' | 'pending' | 'included' | 'confirmed' | 'failed'
export interface Config { scenario: Scenario, amount: number, fee: number, expiryMinutes: number, count: number }
export interface Prepared { hash: string, sender: string, recipient: string, value: number, fee: number, validityStartHeight: number }
export interface Tracked extends Prepared { kind: 'a' | 'b' | 'drain' | 'spam' | 'cleanup' | 'return' | 'deposit' | 'claim', state: TxState, submittedAt: number, index?: number }
export interface Contract { address: string, label: 'A' | 'B', expiry: number, balance: number, registered: boolean }
export interface Head { height: number, timestamp: number }
export interface LabState {
  network: Network
  connected: boolean
  owner: string
  spammer: string
  ownerBalance: number
  spamBalance: number
  head: Head
  stage: Stage
  config: Config | null
  runId: string
  message: string
  error: string
  paused: boolean
  busy: boolean
  observing: boolean
  transactions: Tracked[]
  inventoryUpdatedAt: number
  htlcInventory: { address: string, expiry: number, balance: number }[]
  existingContracts: { address: string, expiry: number, balance: number }[]
  contracts: Contract[]
  evidence: { at: number, message: string }[]
  verdicts: { restart: string, freshImport: string, notes: string }
}

export function initialState(): LabState {
  return {
    network: 'testnet',
    connected: false,
    owner: '',
    spammer: '',
    ownerBalance: 0,
    spamBalance: 0,
    head: { height: 0, timestamp: 0 },
    stage: 'idle',
    config: null,
    runId: '',
    message: 'Import a wallet, then connect to the selected network.',
    error: '',
    paused: false,
    busy: false,
    observing: false,
    transactions: [],
    inventoryUpdatedAt: 0,
    htlcInventory: [],
    existingContracts: [],
    contracts: [],
    evidence: [],
    verdicts: { restart: 'not-checked', freshImport: 'not-checked', notes: '' },
  }
}

export interface Gateway {
  discoverHtlcs: (owner: string) => Promise<LabState['existingContracts']>
  head: () => Promise<Head>
  balance: (address: string) => Promise<number>
  registered: (address: string) => Promise<boolean>
  prepareHtlc: (value: number, fee: number, expiry: number) => Promise<Prepared>
  prepareSpam: (runId: string, index: number, fee: number) => Promise<Prepared>
  prepareDrain: (address: string, value: number, fee: number, expired: boolean) => Promise<Prepared>
  prepareReturn: (value: number, fee: number) => Promise<Prepared>
  broadcast: (hash: string) => Promise<void>
  rebroadcast: (hash: string) => Promise<void>
  transaction: (hash: string) => Promise<TxState>
  historyDepth: (owner: string, oldHash: string, spamHashes: string[], newHash: string) => Promise<number>
}

export const scenarios: { id: Scenario, title: string, description: string, expected: string }[] = [
  { id: 'two', title: 'Two funded HTLCs', description: 'Create two contracts from one wallet. Keep the app closed until both are confirmed.', expected: 'Both contracts are discovered. The app can consolidate funds; both need not remain funded. No lost balance or duplicate history.' },
  { id: 'drained', title: 'Drained old HTLC', description: 'Create A, return its funds through the cosigner, then create B. This tests recovery of historical payments.', expected: 'Old history returns, but the drained balance does not. The funded signer remains usable.' },
  { id: 'expired', title: 'Expired funded HTLC', description: 'Create A and leave it funded until chain time passes its expiry. Keep the app closed while waiting.', expected: 'The app reclaims A with a timeout proof and classifies recovery correctly.' },
  { id: 'bomb', title: 'History bomb', description: 'Expire A, bury its creation under 0.00001 NIM receipts, then create B. The app must scan beyond its first 100 history entries.', expected: 'The app discovers and recovers expired A while preserving B’s funds. No duplicate receipts, false payments, or restored historical balances.' },
]
