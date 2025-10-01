import * as v from 'valibot'
import { ZeroXHexStringSchema } from './common.schema'

export const AuthorizationErrorCodeSchema = v.union([
  v.literal('AMOUNT_BIGGER_THAN_ALLOWED'),
  v.literal('DAILY_SPENDING_LIMIT_REACHED'),
  v.literal('INVALID_SIGNATURE'),
  v.literal('INVALID_NAKA_SIGNATURE'),
  v.literal('INSUFFICIENT_BALANCE'),
  v.literal('UNFAIR_EXCHANGE_RATE'),
  v.literal('MISSING_KYC_DATA'),
])

export const AuthorizationErrorSchema = v.object({
  code: AuthorizationErrorCodeSchema,
  message: v.string(),
})

export const AuthorizationRequestSchema = v.object({
  smart_contract_id: v.pipe(
    ZeroXHexStringSchema,
    v.description('Acquirer’s smart contract id per currency'),
  ),
  external_transaction_id: v.pipe(
    v.string(),
    v.description('NAKA platform transaction ID'),
  ),
  card_token: v.pipe(
    v.string(),
    v.description('Card pan token'),
  ),
  transaction_currency: v.object({
    code: v.pipe(
      v.string(),
      v.description('ISO currency code in which the transaction was created'),
    ),
    number: v.pipe(
      v.number(),
      v.integer(),
      v.description('ISO currency number in which the transaction was created'),
    ),
  }),
  transaction_amount: v.pipe(
    v.number(),
    v.integer(),
    v.description('Total transaction amount in  integer. For example (4 decimal places): 10000 = 1.0000'),
  ),
  transaction_amount_decimal_places: v.pipe(
    v.number(),
    v.integer(),
    v.description('Available value: 4'),
  ),
  transaction_crypto_currency: v.pipe(
    v.string(),
    v.description('For now we are supporting only USDT'),
  ),
  transaction_crypto_amount: v.pipe(
    v.number(),
    v.integer(),
    v.description('Total transaction crypto amount in integer. For example (6 decimal places): 1000000 = 1.000000'),
  ),
  transaction_crypto_amount_decimal_places: v.pipe(
    v.number(),
    v.integer(),
    v.description('Available value: 6'),
  ),
  merchant_id: v.string(),
  merchant_full_name: v.string(),
  store_full_name: v.string(),
  store_address: v.string(),
  store_zip_code: v.string(),
  store_city: v.string(),
  store_country: v.pipe(
    v.string(),
    v.description('Store country. ISO Alpha-2 code'),
  ),
  card_signature: v.pipe(
    v.optional(ZeroXHexStringSchema),
    v.description('NAKA Card blockchain signature, mandatory for Self-Custodial NAKA Cards, optional for Custodial.'),
  ),
  naka_signature: v.pipe(
    ZeroXHexStringSchema,
    v.description('NAKA platform blockchain signature'),
  ),
})

export type AuthorizationRequest = v.InferInput<typeof AuthorizationRequestSchema>

export const AuthorizationErrorResponseSchema = v.pipe(
  v.object({
    error: AuthorizationErrorSchema,
  }),
  v.description('Error responses must have a 400 HTTP status code'),
)

export type AuthorizationErrorResponse = v.InferInput<typeof AuthorizationErrorResponseSchema>

export const AdviceMessageCodeSchema = v.picklist(['CAEXP', 'CALOS', 'CASTO', 'CAUSR', 'WPIN', 'PINEC', 'EXDCL'])

export type AdviceMessageCode = v.InferInput<typeof AdviceMessageCodeSchema>

export const AdviceRequestSchema = v.object({
  card_token: v.pipe(
    v.string(),
    v.description('Card PAN token'),
  ),
  message_code: v.pipe(
    AdviceMessageCodeSchema,
    v.description('Advice message code'),
  ),
})

export type AdviceRequest = v.InferInput<typeof AdviceRequestSchema>

export const ReversalRequestSchema = v.object({
  external_transaction_id: v.pipe(
    v.string(),
    v.description('New NAKA platform transaction ID'),
  ),
  ref_transaction_id: v.pipe(
    v.string(),
    v.description('Transaction ID that is being reversed (NAKA platform ID)'),
  ),
})

export type ReversalRequest = v.InferInput<typeof ReversalRequestSchema>

export const KycStatusEnum = v.union([
  v.literal('INIT'),
  v.literal('PENDING'),
  v.literal('RETRY'),
  v.literal('REJECTED'),
  v.literal('VERIFIED'),
  v.literal('FAILED'),
])

export const UserMetadataSchema = v.object({
  email: v.string(),
  first_name: v.string(),
  middle_name: v.nullish(v.string()),
  last_name: v.string(),
})

export const KycWebhookRequestSchema = v.object({
  kyc_id: v.string(),
  user_external_id: v.string(),
  status: KycStatusEnum,
  user_metadata: v.nullable(UserMetadataSchema),
})

export type KycWebhookRequest = v.InferInput<typeof KycWebhookRequestSchema>
