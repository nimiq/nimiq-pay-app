<script setup lang="ts">
import type { PlainTransactionDetails } from '@nimiq/core'
import type { RemoteSignerValidationResult, ValidatedRemoteSigner } from '@/stores/remote-signer'
import { Clipboard } from '@capacitor/clipboard'
import { alertController, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonInput, IonItem, IonLabel, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonToggle, toastController } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed, onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { isDev, isTestnet, networkOverride, setNetworkOverride } from '@/lib'
import { isMockBakedIn, isMockEnabled, setMockDataOverride } from '@/lib/mock-mode'
import { POLYGON_PUBLIC_RPCS, polygonRpcOverride, setPolygonRpcOverride } from '@/lib/polygon/rpc-override'
import { SQLQuery } from '@/lib/sql-queries'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useFeatureFlags } from '@/stores/feature-flags'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { HTLC_AUTO_EXTEND_LOOKAHEAD_MS, useSync } from '@/stores/sync'
import { useSyncState } from '@/stores/sync/state'
import { useTransactions } from '@/stores/transactions'
import { Transfer } from '@/types/transactions'

const logger = useLogger('DevModal')

// Note: no translations in this file as it's for dev purposes only.

const router = useRouter()

const { consensus, head, height, peerCount, client, networkName, headTimestamp } = storeToRefs(useNimiqNetwork())
const { localAddress, localBalance } = storeToRefs(useLocalWallet())
const remoteSignerStore = useRemoteSigner()
const { remoteAddress, remoteBalance, start: validityStart, end: validityEnd, isRemoteOk, isHtlcActive, hasHtlcExpired, remoteHeight } = storeToRefs(remoteSignerStore)
const { discoverRemoteSignersFromBlockchain, validateRemoteSignerAddress } = remoteSignerStore
const { recoverRemoteSigner, verifyRemoteSignersDb } = useSync()
const { showHiddenTransactions } = storeToRefs(useApp())
const { polygonRpcUrl } = storeToRefs(useFeatureFlags())
const { headChangePendingDrainLock, htlcCheckLock, headChangeUpdatesLock, isNetworkReconnecting, isProcessingRemote, isSendingTx, isSyncingWallets, isUpdatingTransactions } = storeToRefs(useLocks())
const { clearTxHistory, sendTx } = useTransactions()
const { query, run } = useConn()
const txInMemPool = shallowRef<PlainTransactionDetails>()

const htlcAddress = shallowRef('')
const htlcValidation = shallowRef<RemoteSignerValidationResult>()
const htlcStatus = shallowRef('Enter an HTLC address or scan local transaction history.')
const isHtlcRecoveryBusy = shallowRef(false)

const NETWORK_CHOICES = ['default', 'mainnet', 'testnet'] as const
type NetworkChoice = typeof NETWORK_CHOICES[number]
const currentNetworkChoice = computed<NetworkChoice>(() => networkOverride ?? 'default')

function isNetworkChoice(v: unknown): v is NetworkChoice {
  return typeof v === 'string' && (NETWORK_CHOICES as readonly string[]).includes(v)
}

const DEFAULT_POLYGON_RPC_VALUE = '__default__'
const currentPolygonRpcChoice = computed<string>(() => polygonRpcOverride ?? DEFAULT_POLYGON_RPC_VALUE)

function onPolygonRpcChange(value: unknown) {
  if (typeof value !== 'string' || value === currentPolygonRpcChoice.value)
    return
  const next = value === DEFAULT_POLYGON_RPC_VALUE ? null : value
  setPolygonRpcOverride(next)
  router.go(0)
}

async function onNetworkSegmentChange(value: unknown) {
  if (!isNetworkChoice(value) || value === currentNetworkChoice.value)
    return

  // Tx history, remote signers, and swap state are environment-scoped — purge before flipping.
  const alert = await alertController.create({
    header: `Switch to ${value === 'default' ? 'DEFAULT' : value.toUpperCase()}?`,
    message: 'This will clear your local transaction history, remote signer registrations, and pending swaps. Your wallet, PIN, and backup remain intact.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Switch', role: 'confirm' },
    ],
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'confirm')
    return

  // Must run before the override flip: remote signer addresses, swap HTLCs, and swap quotes are
  // tied to a specific cosigner (per-network public key) — leaving them in place causes the next
  // session to load a foreign-network signer as "active" and stall sync.
  useSyncState().walletContextGeneration += 1
  await Promise.allSettled([
    clearTxHistory(),
    remoteSignerStore.purgeRemoteSigners(),
    Promise.all([run(SQLQuery.PurgeSwapHtlcs), run(SQLQuery.PurgeSwapQuotes)]),
  ])
  setNetworkOverride(value === 'default' ? null : value)
  router.go(0)
}

function onMockToggle(checked: boolean) {
  setMockDataOverride(checked)
  router.go(0)
}

async function writeToClipboard(string: string) {
  await Clipboard.write({
    string,
  })
  const toast = await toastController.create({
    message: 'Address copied to clipboard',
    duration: 1500,
    position: 'bottom',
  })

  await toast.present()
};

async function handleClearTx() {
  // Clear tx table
  await clearTxHistory()
  router.go(0)
}

function onHtlcAddressInput(value: string | null | undefined) {
  htlcAddress.value = value || ''
  htlcValidation.value = undefined
  htlcStatus.value = 'Validate the address before adding it.'
}

function setHtlcRecoveryError(error: unknown) {
  htlcStatus.value = error instanceof Error ? error.message : String(error)
}

async function scanForMissingHtlcs() {
  isHtlcRecoveryBusy.value = true
  htlcStatus.value = 'Scanning local transaction history…'
  try {
    const result = await discoverRemoteSignersFromBlockchain()
    await verifyRemoteSignersDb({ discoveryResult: result })
    const completeness = result.localComplete ? '' : ' History scan was incomplete.'
    const errors = result.errors.length ? ` ${result.errors.join('; ')}` : ''
    htlcStatus.value = `Scan complete: ${result.added} added, ${result.alreadyKnown} already known.${completeness}${errors}`
  }
  catch (error) {
    setHtlcRecoveryError(error)
  }
  finally {
    isHtlcRecoveryBusy.value = false
  }
}

async function validateHtlcAddress() {
  isHtlcRecoveryBusy.value = true
  htlcStatus.value = 'Validating HTLC…'
  try {
    const result = await validateRemoteSignerAddress(htlcAddress.value)
    htlcValidation.value = result
    if (result.status === 'invalid') {
      htlcStatus.value = result.reason
      return
    }

    const balance = result.balance / 1e5
    htlcStatus.value = result.status === 'known'
      ? `HTLC is already known and holds ${balance} NIM.`
      : `Verified HTLC holds ${balance} NIM.`
  }
  catch (error) {
    setHtlcRecoveryError(error)
  }
  finally {
    isHtlcRecoveryBusy.value = false
  }
}

const recoveryMessages = {
  'submitted': 'Recovery transaction submitted for this HTLC.',
  'unknown': 'Recovery outcome is unknown. The transaction remains pending; do not retry.',
  'wallet-busy': 'HTLC registered. Recovery deferred: another transaction is unresolved.',
  'history-incomplete': 'HTLC registered. Recovery deferred: target transaction history is incomplete.',
  'outgoing-transaction': 'HTLC registered. Recovery deferred: an outgoing transaction already exists for this HTLC.',
  'no-consensus': 'Recovery deferred: waiting for consensus to confirm the HTLC timeout.',
} as const

async function recoverValidatedHtlc(result: ValidatedRemoteSigner) {
  const balance = result.balance / 1e5
  const alert = await alertController.create({
    header: 'Recover this HTLC?',
    message: `This HTLC belongs to this wallet and currently holds ${balance} NIM. Nimiq Pay will register only this address and attempt one recovery transaction. If recovery cannot start safely, the signer will remain inactive for later reconciliation.`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Recover', role: 'confirm' },
    ],
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'confirm')
    return

  isHtlcRecoveryBusy.value = true
  htlcStatus.value = 'Recovering HTLC…'
  try {
    const recoveryResult = await recoverRemoteSigner(result)
    if (recoveryResult.status === 'deferred')
      htlcStatus.value = recoveryMessages[recoveryResult.reason]
    else if (recoveryResult.status === 'rejected')
      htlcStatus.value = `Recovery rejected: ${recoveryResult.reason}`
    else
      htlcStatus.value = recoveryMessages[recoveryResult.status]
  }
  catch (error) {
    setHtlcRecoveryError(error)
  }
  finally {
    isHtlcRecoveryBusy.value = false
  }
}

onMounted(async () => {
  const remoteSignerTable = await query('SELECT * FROM remote_signers')

  logger.log('Remote Signers Table', remoteSignerTable.length, remoteSignerTable)
  const activeSigner = await query('SELECT * FROM remote_signers WHERE active = 1')

  logger.log('Active Signer', activeSigner)

  const transacions = await query('SELECT * FROM transactions')

  logger.log('Transactions from DB', transacions)

  const priceTable = await query('SELECT * FROM prices')

  logger.log('Price table', priceTable)

  const pendingSwapQuotes = await query(SQLQuery.GetAllSwapQuotes)

  logger.log('Pending Swap Quotes', pendingSwapQuotes)

  client.value?.addTransactionListener(async (tx) => {
    txInMemPool.value = tx
  }, [localAddress.value])
})
</script>

<template>
  <ModalTemplate>
    <IonButton class="w-full" @click="() => router.go(0)">
      Reload
    </IonButton>
    <IonButton class="w-full" @click="() => useNimiqNetwork().reconnect()">
      Reconnect to Network
    </IonButton>
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Network</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p class="mb-2">
          Current: <strong>{{ isTestnet ? 'TESTNET' : 'MAINNET' }}</strong>
          <span v-if="networkOverride"> (forced)</span>
          <span v-else> (default — tracks {{ isDev ? 'dev' : 'prod' }} build)</span>
        </p>
        <IonSegment :value="currentNetworkChoice" @ion-change="onNetworkSegmentChange($event.detail.value)">
          <IonSegmentButton value="default">
            Default
          </IonSegmentButton>
          <IonSegmentButton value="mainnet">
            Mainnet
          </IonSegmentButton>
          <IonSegmentButton value="testnet">
            Testnet
          </IonSegmentButton>
        </IonSegment>
        <p class="mt-2 text-xs opacity-60">
          Switching clears tx history and reloads. Only Nimiq mini-apps pick up the testnet RPC — EVM mini-apps have no testnet wiring and will keep running against mainnet chains.
        </p>
      </IonCardContent>
    </IonCard>
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Polygon RPC</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p class="mb-2">
          Effective URL: <code>{{ polygonRpcUrl }}</code>
        </p>
        <p class="mb-2 text-xs opacity-60">
          <span v-if="polygonRpcOverride">Local override active. </span>
          Affects the main-app Polygon USDT client only — mini-apps are unaffected.
        </p>
        <IonItem lines="none" class="-mx-4">
          <IonLabel>RPC node</IonLabel>
          <IonSelect
            :value="currentPolygonRpcChoice"
            interface="action-sheet"
            @ion-change="onPolygonRpcChange($event.detail.value)"
          >
            <IonSelectOption :value="DEFAULT_POLYGON_RPC_VALUE">
              Default
            </IonSelectOption>
            <IonSelectOption
              v-for="rpc in POLYGON_PUBLIC_RPCS"
              :key="rpc.url"
              :value="rpc.url"
            >
              {{ rpc.label }}
            </IonSelectOption>
          </IonSelect>
        </IonItem>
        <p class="mt-2 text-xs opacity-60">
          Switching reloads the page. The new RPC takes effect on the next request the Polygon USDT store makes.
        </p>
      </IonCardContent>
    </IonCard>
    <IonCard v-if="isDev">
      <IonCardHeader>
        <IonCardTitle>Mock Data</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p class="mb-2">
          Replaces balances, transactions and prices with in-memory fixtures and skips
          blockchain sync. For UI development and store screenshots. Hides the dev FAB — reopen
          this modal via a 3s long-press on the menu header. Reloads on change.
          <span v-if="isMockBakedIn">Baked in via VITE_MOCK_DATA — cannot be disabled here.</span>
        </p>
        <IonItem lines="none" class="-mx-4">
          <IonLabel>Enable mock data</IonLabel>
          <IonToggle :checked="isMockEnabled" :disabled="isMockBakedIn" @ion-change="onMockToggle($event.detail.checked)" />
        </IonItem>
      </IonCardContent>
    </IonCard>
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Hidden Transactions</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p class="mb-2">
          Reveal transactions hidden via 5-second long-press. While ON, hidden TX render at 30% opacity and can be unhidden by long-pressing them again.
        </p>
        <IonItem lines="none" class="-mx-4">
          <IonLabel>Show hidden transactions</IonLabel>
          <IonToggle :checked="showHiddenTransactions" @ion-change="showHiddenTransactions = $event.detail.checked" />
        </IonItem>
      </IonCardContent>
    </IonCard>
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Nimiq Client</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p>Peer count: <strong>{{ peerCount }}</strong></p>
        <p>Consensus state: <strong>{{ consensus }}</strong></p>
        <p>
          Head <strong>{{ height }}</strong>:
          <code>{{ head?.hash }}</code>
        </p>
        <p>Head timestamp: <strong>{{ headTimestamp }}</strong></p>
        <p>Network: <strong>{{ networkName }}</strong></p>
      </IonCardContent>
    </IonCard>
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Local Wallet</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p @click="() => writeToClipboard(localAddress && localAddress.toUserFriendlyAddress() || '')">
          Address: <code>{{ localAddress && localAddress.toUserFriendlyAddress() }}</code>
        </p>
        <p>Balance: <code>{{ localBalance / 1e5 }} NIM</code></p>
        <IonButton
          :disabled="consensus !== 'established' || localBalance === 0"
          @click="sendTx({ transfer: Transfer.LocalToRemote })"
        >
          Move
          to instant
        </IonButton>
      </IonCardContent>
    </IonCard>

    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Remote Wallet</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p>Remote Height: <strong>{{ remoteHeight }}</strong></p>
        <p @click="() => writeToClipboard(remoteAddress?.toUserFriendlyAddress() || '')">
          Address: <code>{{ remoteAddress?.toUserFriendlyAddress() }}</code>
        </p>
        <p>Balance (if valid): <code>{{ remoteBalance / 1e5 }} NIM</code></p>
        <p>
          Valid: <strong>{{ isHtlcActive }}</strong>
          (from <strong>{{ validityStart }}</strong>
          to <strong>{{ validityEnd }}</strong>)
        </p>
        <p>Will be extended in: <strong> {{ Math.ceil(validityEnd - (validityEnd - validityStart) / 2) - HTLC_AUTO_EXTEND_LOOKAHEAD_MS + 1 }}</strong></p>
        <p>Timeouted: <strong>{{ hasHtlcExpired }}</strong></p>
        <IonButton
          :disabled="!(isRemoteOk || hasHtlcExpired) || remoteBalance === 0"
          @click="sendTx({ transfer: Transfer.RemoteToLocal })"
        >
          Recover
        </IonButton>
        <IonButton
          :disabled="!(isRemoteOk || hasHtlcExpired) || remoteBalance === 0"
          @click="sendTx({ transfer: Transfer.ExtendRemote })"
        >
          Extend
        </IonButton>
      </IonCardContent>
    </IonCard>

    <IonCard class="w-full">
      <IonCardHeader>
        <IonCardTitle>Tx Listener</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p class="flex flex-col">
          <span>Recipient: {{ txInMemPool?.recipient }}</span>
          <span>Sender: {{ txInMemPool?.sender }}</span>
          <span>Value: {{ (txInMemPool?.value || 0) / 1e5 }} NIM</span>
          <span>State: {{ txInMemPool?.state }} </span>
          <span>Hash: {{ txInMemPool?.transactionHash }} </span>
          <span>Network: {{ txInMemPool?.network }}</span>
        </p>
      </IonCardContent>
    </IonCard>

    <IonCard class="w-full">
      <IonCardHeader>
        <IonCardTitle>Locks</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p class="flex flex-col">
          <span>Head change pending drain lock: {{ headChangePendingDrainLock }}</span>
          <span>HTLC check lock: {{ htlcCheckLock }}</span>
          <span>Head change updates lock: {{ headChangeUpdatesLock }}</span>
          <span>Network reconnecting: {{ isNetworkReconnecting }}</span>
          <span>Processing remote: {{ isProcessingRemote }}</span>
          <span>Sending tx: {{ isSendingTx }}</span>
          <span>Syncing wallets: {{ isSyncingWallets }}</span>
          <span>Updating transactions: {{ isUpdatingTransactions }}</span>
        </p>
      </IonCardContent>
    </IonCard>

    <IonCard class="w-full">
      <IonCardHeader>
        <IonCardTitle>Missing HTLC recovery</IonCardTitle>
      </IonCardHeader>
      <IonCardContent class="flex flex-col gap-2">
        <p>
          Scan the local wallet history, or validate one exact HTLC address before recovering it.
        </p>
        <IonButton
          data-testid="htlc-scan"
          :disabled="isHtlcRecoveryBusy"
          @click="scanForMissingHtlcs"
        >
          Scan wallet history
        </IonButton>
        <IonInput
          data-testid="htlc-address"
          aria-label="HTLC address"
          fill="outline"
          label="HTLC address"
          label-placement="stacked"
          :disabled="isHtlcRecoveryBusy"
          :value="htlcAddress"
          @ion-input="onHtlcAddressInput($event.detail.value)"
        />
        <IonButton
          data-testid="htlc-validate"
          :disabled="isHtlcRecoveryBusy || !htlcAddress.trim()"
          @click="validateHtlcAddress"
        >
          Validate address
        </IonButton>
        <p data-testid="htlc-status" class="text-sm">
          {{ htlcStatus }}
        </p>
        <div
          v-if="htlcValidation && htlcValidation.status !== 'invalid'"
          data-testid="htlc-details"
          class="text-xs"
        >
          <p>Address: <code>{{ htlcValidation.address }}</code></p>
          <p>Balance: <code>{{ htlcValidation.balance / 1e5 }} NIM</code></p>
          <p>Timeout: <code>{{ htlcValidation.timeout }}</code></p>
          <p>Expired: <code>{{ htlcValidation.expired }}</code></p>
          <p>Owner: <code>{{ htlcValidation.owner }}</code></p>
          <p>Cosigner: <code>{{ htlcValidation.cosignerRecipient }}</code></p>
          <p>Creation: <code>{{ htlcValidation.creationState || 'unavailable' }}</code></p>
          <p>Status: <code>{{ htlcValidation.status }}</code></p>
        </div>
        <IonButton
          v-if="htlcValidation && htlcValidation.status !== 'invalid'"
          data-testid="htlc-recover"
          :disabled="isHtlcRecoveryBusy"
          @click="recoverValidatedHtlc(htlcValidation)"
        >
          Recover HTLC
        </IonButton>
      </IonCardContent>
    </IonCard>

    <IonButton @click="handleClearTx">
      Clear Tx History
    </IonButton>
  </ModalTemplate>
</template>
