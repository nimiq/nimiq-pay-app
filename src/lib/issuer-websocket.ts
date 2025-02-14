import type * as v from 'valibot'
import type {
  AuthenticateConfirmMessageSchema,
  AuthenticateStartMessageSchema,
  PaymentAcceptMessageSchema,
  PaymentConfirmMessageSchema,
  PaymentRejectedMessage,
  PaymentRejectMessageSchema,
  PaymentRequestMessage,
  PaymentSuccessMessage,
  PaymentTriggerMessageScheme,
} from './issuer-websocket.schema'
import { useWebSocket } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { parse } from 'valibot'
import { computed, ref, watch } from 'vue'
import { isDev } from '.'
import { useLogger } from '../composables/useLogger'
import { useLocalWallet } from '../stores/local-wallet'
import { useRemoteSigner } from '../stores/remote-signer'
import { ServerMessageSchema } from './issuer-websocket.schema'

type IncomingServerMessage = v.InferOutput<typeof ServerMessageSchema>

// Ensure that we are constructing the correct _input_ types for outgoing messages
type AuthenticateConfirmMessage = v.InferInput<typeof AuthenticateConfirmMessageSchema>
type AuthenticateStartMessage = v.InferInput<typeof AuthenticateStartMessageSchema>
type PaymentAcceptMessage = v.InferInput<typeof PaymentAcceptMessageSchema>
type PaymentConfirmMessage = v.InferInput<typeof PaymentConfirmMessageSchema>
type PaymentRejectMessage = v.InferInput<typeof PaymentRejectMessageSchema>
type PaymentTriggerMessage = v.InferInput<typeof PaymentTriggerMessageScheme>

const wsLogger = useLogger('NakaSocket')

export function useIssuerWebSocket() {
  const { status, data, send } = useWebSocket<string>('ws://127.0.0.1:8081', {
    autoReconnect: true,
    heartbeat: {
      interval: isDev ? 10e3 : 1e3,
    },
    onConnected(ws) {
      wsLogger.log('Connected:', ws.url)
    },
    onDisconnected(ws, event) {
      wsLogger.log('Disconnected:', ws.url, event)
    },
    onError(ws, event) {
      wsLogger.error('Error:', ws.url, event)
    },
  })

  watch(status, (newStatus) => {
    wsLogger.log('Status:', newStatus)
    if (newStatus === 'OPEN') {
      // Kick off the authentication handshake
      const msg: AuthenticateStartMessage = {
        type: 'authenticate:start',
        address: useLocalWallet().localAddress.toUserFriendlyAddress(),
      }
      send(JSON.stringify(msg))
    }
  }, { immediate: true })

  const paymentReady = ref(false)

  const paymentRequest = ref<PaymentRequestMessage>()
  const paymentRejection = ref<PaymentRejectedMessage['code']>()

  // Internal queue of pending payments, not exposed
  const pendingPayments = new Map<PaymentConfirmMessage['id'], {
    resolve: (msg: PaymentSuccessMessage) => void
    reject: (reason: string) => void
  }>()

  function cancelPendingPayments(reason?: string) {
    for (const [id, pending] of pendingPayments.entries()) {
      pending.reject(reason || 'Payment aborted')
      pendingPayments.delete(id)
    }
  }

  /**
   * The return value `boolean` is used to typecheck that all message types are handled.
   * The return type can therefore not be `undefined`.
   */
  function handleIssuerMessage(msg: IncomingServerMessage): boolean {
    switch (msg.type) {
      case 'authenticate:challenge': {
        wsLogger.log('Received challenge:', msg.challenge)
        // Sign challenge and respond with signature
        const { localWallet } = useLocalWallet()
        const payload = `\x16Nimiq Signed Message:\n${msg.challenge.length}${msg.challenge}`
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)).then((hash) => {
          const signature = localWallet.sign(new Uint8Array(hash))
          const response: AuthenticateConfirmMessage = {
            type: 'authenticate:confirm',
            signature: signature.toHex(),
            publicKey: localWallet.publicKey.toHex(),
          }
          send(JSON.stringify(response))
        })
        return true
      }
      case 'authenticate:success': {
        wsLogger.log('Challenge OK')
        const { remoteAddress, remoteBalance } = storeToRefs(useRemoteSigner())
        if (remoteAddress.value) {
          const response: PaymentAcceptMessage = {
            type: 'payment:accept',
            address: remoteAddress.value.toUserFriendlyAddress(),
            amount: BigInt(remoteBalance.value).toString(10),
            rails: ['naka-card'],
          }
          send(JSON.stringify(response))
        }
        return true
      }
      case 'authenticate:error':
        wsLogger.error('Challenge failed:', msg.message)
        return true
      case 'payment:ready':
        wsLogger.log('Payments ready')
        // TODO: Verify returned rails, address and balance?
        paymentReady.value = true
        return true
      case 'payment:abort': {
        wsLogger.error('Payments aborted:', msg.message)
        paymentReady.value = false
        cancelPendingPayments(msg.message)
        // Try to restart payment session
        const { remoteAddress, remoteBalance } = storeToRefs(useRemoteSigner())
        if (remoteAddress.value) {
          const response: PaymentAcceptMessage = {
            type: 'payment:accept',
            address: remoteAddress.value.toUserFriendlyAddress(),
            amount: BigInt(remoteBalance.value).toString(10),
            rails: ['naka-card'],
          }
          send(JSON.stringify(response))
        }
        return true
      }
      case 'payment:request':
        wsLogger.log('Received payment request:', msg)
        paymentRequest.value = msg
        return true
      case 'payment:success': {
        const pending = pendingPayments.get(msg.id)
        if (pending) {
          wsLogger.log('Payment success:', msg)
          pending.resolve(msg)
          pendingPayments.delete(msg.id)
        }
        else {
          wsLogger.warn('Unexpected payment success, no pending payment:', msg)
        }
        return true
      }
      case 'payment:rejected': {
        // Payment request from NAKA rejected server-side, not even forwarded to app
        // If this happens, we want to show this to the user, because she's waiting for feedback from the NFC scan
        wsLogger.error('Payment rejected:', msg)
        paymentRejection.value = msg.code
        return true
      }
      case 'error':
        switch (msg.level) {
          case 'warning':
            wsLogger.warn('Server warning:', msg.message)
            break
          case 'fatal':
            wsLogger.error('Server fatal error:', msg.message)
            paymentReady.value = false
            cancelPendingPayments(msg.message)
            break
        }
        return true
    }
  }

  watch(data, (newData) => {
    if (!newData)
      return

    let msg: IncomingServerMessage
    try {
      if (newData === 'pong')
        return
      msg = parse(ServerMessageSchema, JSON.parse(newData))
    }
    catch (e) {
      wsLogger.error('Failed to parse message:', e)
      return
    }

    handleIssuerMessage(msg)
  })

  const isReady = computed(() => status.value === 'OPEN' && paymentReady.value)

  async function confirmPayment(
    id: PaymentConfirmMessage['id'],
    rail: PaymentConfirmMessage['rail'],
    transaction: PaymentConfirmMessage['transaction'],
  ) {
    const message: PaymentConfirmMessage = {
      type: 'payment:confirm',
      id,
      rail,
      transaction,
    }
    const promise = new Promise<PaymentSuccessMessage>((resolve, reject) => {
      pendingPayments.set(id, { resolve, reject })
    })
    send(JSON.stringify(message))
    return promise
  }

  async function rejectPayment(
    id: PaymentRejectMessage['id'],
    rail: PaymentRejectMessage['rail'],
    code?: PaymentRejectMessage['code'],
    message?: PaymentRejectMessage['message'],
  ) {
    const msg: PaymentRejectMessage = {
      type: 'payment:reject',
      id,
      rail,
      code,
      message,
    }
    send(JSON.stringify(msg))
  }

  async function triggerPayment(recipient: string, amount: bigint) {
    const message: PaymentTriggerMessage = {
      type: 'payment:trigger',
      rail: 'naka-card',
      recipient,
      amount: amount.toString(10),
    }
    send(JSON.stringify(message))
  }

  return {
    isReady,
    paymentRequest,
    paymentRejection,
    confirmPayment,
    rejectPayment,
    triggerPayment,
  }
}
