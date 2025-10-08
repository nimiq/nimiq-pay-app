import * as v from 'valibot'
import { HexStringSchema, NimiqAddressSchema, NimiqAmountSchema, PaymentRailSchema, StoreSchema, ZeroXHexStringSchema } from './common.schema'
import { AuthorizationErrorCodeSchema as NakaAuthorizationErrorCodeSchema } from './naka-issuer.schema'

export const ErrorMessageSchema = v.pipe(
  v.object({
    type: v.literal('error'),
    level: v.optional(v.picklist(['warning', 'fatal']), 'warning'),
    message: v.optional(v.string()),
  }),
  v.description('Sent in either direction to indicate an error. Warnings are typically meant for developers or in logs, Fatal errors are critical and typically result in connection closure.'),
)

export type ErrorMessage = v.InferOutput<typeof ErrorMessageSchema>

export const AuthenticateStartMessageSchema = v.pipe(
  v.object({
    type: v.literal('authenticate:start'),
    address: v.pipe(NimiqAddressSchema, v.description('User\'s local wallet address')),
  }),
  v.description('Sent from client to server to initiate the authentication flow. This can only be sent once on a websocket connection.'),
)

export type AuthenticateStartMessage = v.InferOutput<typeof AuthenticateStartMessageSchema>

export const AuthenticateChallengeMessageSchema = v.pipe(
  v.object({
    type: v.literal('authenticate:challenge'),
    challenge: v.string(),
  }),
  v.description('Sent from server to client to provide a challenge to sign'),
)

export type AuthenticateChallengeMessage = v.InferOutput<typeof AuthenticateChallengeMessageSchema>

export const AuthenticateConfirmMessageSchema = v.pipe(
  v.object({
    type: v.literal('authenticate:confirm'),
    signature: v.pipe(HexStringSchema, v.description('Hex-encoded signature of the challenge using the user\'s local private key')),
    publicKey: v.pipe(HexStringSchema, v.description('Hex-encoded user\'s local public key')),
  }),
  v.description('Sent from client to server to provide the signed challenge'),
)

export type AuthenticateConfirmMessage = v.InferOutput<typeof AuthenticateConfirmMessageSchema>

export const AuthenticateSuccessMessageSchema = v.pipe(
  v.object({
    type: v.literal('authenticate:success'),
    address: v.pipe(
      NimiqAddressSchema,
      v.description('User\'s local wallet address (as authenticated)'),
    ),
  }),
  v.description('Sent from server to client once authentication finished successfully'),
)

export type AuthenticateSuccessMessage = v.InferOutput<typeof AuthenticateSuccessMessageSchema>

export const AuthenticateErrorMessageSchema = v.pipe(
  v.object({
    type: v.literal('authenticate:error'),
    message: v.string(),
  }),
  v.description('Sent from server to client if authentication failed. This can happen after at any point between authenticate:start and authenticate:success (e.g. due to invalid address, invalid signature or after timeout).'),
)

export type AuthenticateErrorMessage = v.InferOutput<typeof AuthenticateErrorMessageSchema>

export const PaymentAcceptMessageSchema = v.pipe(
  v.object({
    type: v.literal('payment:accept'),
    address: v.pipe(
      NimiqAddressSchema,
      v.description('User\'s current active HTLC wallet (where transactions come from)'),
    ),
    amount: v.pipe(
      NimiqAmountSchema,
      v.description('The maximum payment request amount to be routed through this WebSocket connections, in Luna. Any amount higher than this will be rejected immediately on the server claiming insufficient balance.'),
    ),
    rails: v.pipe(
      v.array(PaymentRailSchema),
      v.description('Supported payment networks'),
    ),
  }),
  v.description('Sent from client to server to indicate readiness for incoming transaction requests. This can be sent more than once on a given connection to update the active HTLC wallet or the amount. Provided details is always a request and the server may overwrite any of the details and use select its own values via payment:ready.'),
)

export type PaymentAcceptMessage = v.InferOutput<typeof PaymentAcceptMessageSchema>

export const PaymentReadyMessageScheme = v.pipe(
  v.object({
    type: v.literal('payment:ready'),
    address: v.pipe(
      NimiqAddressSchema,
      v.description('User\'s current active HTLC wallet'),
    ),
    amount: v.pipe(
      NimiqAmountSchema,
      v.description('The maximum payment request amount to be routed through this WebSocket connections, in Luna. Any amount higher than this will be rejected immediately on the server claiming insufficient balance.'),
    ),
    rails: v.pipe(
      v.array(PaymentRailSchema),
      v.description('Active payment networks'),
    ),
  }),
  v.description('Sent from the server to the client in response to payment:accept or for any other reason (e.g. if the server notices a balance change). Note that the values presented here are the actual life values on the connection and may differ from the values requested via payment:accept.'),
)

export type PaymentReadyMessage = v.InferOutput<typeof PaymentReadyMessageScheme>

export const PaymentRequestMessageSchema = v.pipe(
  v.object({
    type: v.literal('payment:request'),
    rail: PaymentRailSchema,
    id: v.pipe(
      v.string(),
      v.description('Server assigned transaction id (not related to on chain transaction hash)'),
    ),
    amount: v.pipe(
      NimiqAmountSchema,
      v.custom((value: unknown) => BigInt(value as string) > 0n, 'Amount must be greater than 0'),
      v.description('Transaction amount in Luna'),
    ),
    recipient: v.pipe(
      NimiqAddressSchema,
      v.description('Recipient address'),
    ),
    timeout: v.optional(v.pipe(
      v.number(),
      v.integer(),
      v.description('Timestamp in milliseconds. If present, the payment:confirm has to be sent before this.'),
    )),
    skipUserConfirmation: v.optional(v.pipe(
      v.boolean(),
      v.description('If present and set to true, the transaction should be signed and confirmed without user confirmation'),
    )),
    additionalAmounts: v.optional(v.pipe(
      v.array(v.object({
        currency: v.pipe(
          v.string(),
          v.minLength(3),
        ),
        amount: v.pipe(
          v.number(),
          v.integer(),
        ),
        decimals: v.pipe(
          v.number(),
          v.integer(),
          v.description('The number of decimal digits on the value in amount. If amount is 200 and decimals is 4, the resulting value should be 0.02.'),
        ),
      })),
      v.description('The transaction amount in other currencies'),
    )),
    merchant: v.optional(v.pipe(
      v.object({
        id: v.optional(v.pipe(
          v.string(),
          v.description('ID of the merchant within the payment network as specified by rail. Not guaranteed to be globally unique.'),
        )),
        name: v.optional(v.string()),
      }),
    )),
    store: v.optional(StoreSchema),
    signatures: v.optional(v.pipe(
      v.object({
        card: v.optional(ZeroXHexStringSchema),
        system: v.optional(ZeroXHexStringSchema),
      }),
      v.description('Additional transaction signatures'),
    )),
  }),
  v.description('Sent from server to client when there is an incoming payment request'),
)

export type PaymentRequestMessage = v.InferOutput<typeof PaymentRequestMessageSchema>

export const PaymentConfirmMessageSchema = v.pipe(
  v.object({
    type: v.literal('payment:confirm'),
    rail: PaymentRailSchema,
    id: v.pipe(
      v.string(),
      v.description('Same as during request'),
    ),
    transaction: v.pipe(
      HexStringSchema,
      v.description('The signed transaction to confirm the request. This transaction must be co-signed by the Nimiq Pay cosigner and the user\'s local wallet key (as identified during transaction setup), coming from the address indicated in the payment:ready and carrying the recipient and amount as indicated in the payment:request.'),
    ),
    timings: v.optional(v.pipe(
      v.object({
        // All timestamps in milliseconds since UNIX epoch
        timeStart: v.number(), // When the payment:request was received by the client
        timeEnd: v.number(), // When the payment:confirm or payment:reject was sent by the client
      }),
      v.description('Optional performance timings collected by the client'),
    )),
  }),
  v.description('Sent from client to server when a transaction received via payment:request was confirmed (either by user or automatically) and signed.'),
)

export type PaymentConfirmMessage = v.InferOutput<typeof PaymentConfirmMessageSchema>

export const PaymentRejectMessageSchema = v.pipe(
  v.object({
    type: v.literal('payment:reject'),
    rail: PaymentRailSchema,
    id: v.pipe(
      v.string(),
      v.description('Same as during request'),
    ),
    message: v.optional(v.string()),
    code: v.optional(v.pipe(
      NakaAuthorizationErrorCodeSchema,
      v.description('Reason to send for the rejection'),
    )),
    timings: v.optional(v.pipe(
      v.object({
        // All timestamps in milliseconds since UNIX epoch
        timeStart: v.number(), // When the payment:request was received by the client
        timeEnd: v.number(), // When the payment:confirm or payment:reject was sent by the client
      }),
      v.description('Optional performance timings collected by the client'),
    )),
  }),
  v.description('Sent from client to server when a transaction received via payment:request was rejected (either by user or automatically).'),
)

export type PaymentRejectMessage = v.InferOutput<typeof PaymentRejectMessageSchema>

export const PaymentAbortMessageSchema = v.pipe(
  v.object({
    type: v.literal('payment:abort'),
    message: v.optional(v.string()),
  }),
  v.description('Sent from server to client when the payment session including all pending payments was aborted. This can happen at any point after payment:accept (e.g. after timeout or in response to invalid payment:accept or payment:confirm). The client can try to start a new payment session using payment:accept'),
)

export type PaymentAbortMessage = v.InferOutput<typeof PaymentAbortMessageSchema>

export const PaymentSuccessMessageSchema = v.pipe(
  v.object({
    type: v.literal('payment:success'),
    rail: PaymentRailSchema,
    id: v.pipe(
      v.string(),
      v.description('Same as during request'),
    ),
  }),
  v.description('Sent from server to client after successful payment:confirm.'),
)

export type PaymentSuccessMessage = v.InferOutput<typeof PaymentSuccessMessageSchema>

export const PaymentRejectedMessageSchema = v.pipe(
  v.object({
    type: v.literal('payment:rejected'),
    rail: PaymentRailSchema,
    code: v.pipe(
      NakaAuthorizationErrorCodeSchema,
      v.description('Reason sent for rejection'),
    ),
  }),
  v.description('Sent from server to client after a payment request was rejected server-side'),
)

export type PaymentRejectedMessage = v.InferOutput<typeof PaymentRejectedMessageSchema>

export const ServerMessageSchema = v.variant('type', [
  ErrorMessageSchema,
  AuthenticateChallengeMessageSchema,
  AuthenticateSuccessMessageSchema,
  AuthenticateErrorMessageSchema,
  PaymentReadyMessageScheme,
  PaymentRequestMessageSchema,
  PaymentAbortMessageSchema,
  PaymentSuccessMessageSchema,
  PaymentRejectedMessageSchema,
])

export type ServerMessage = v.InferOutput<typeof ServerMessageSchema>

export const ClientMessageSchema = v.variant('type', [
  ErrorMessageSchema,
  AuthenticateStartMessageSchema,
  AuthenticateConfirmMessageSchema,
  PaymentAcceptMessageSchema,
  PaymentConfirmMessageSchema,
  PaymentRejectMessageSchema,
])

export type ClientMessage = v.InferOutput<typeof ClientMessageSchema>

export const MessageSchema = v.variant('type', [ClientMessageSchema, ServerMessageSchema])

export type Message = v.InferOutput<typeof MessageSchema>
