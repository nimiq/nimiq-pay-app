import * as v from 'valibot'

// REST API

export const ErrorResponseSchema = v.object({
  code: v.string(),
  result: v.string(),
})

export type ErrorResponse = v.InferOutput<typeof ErrorResponseSchema>

export const ContractStateSchema = v.union([
  v.literal('onboarding'),
  v.literal('active'),
  v.literal('suspended'),
])

export type ContractState = v.InferOutput<typeof ContractStateSchema>

export const ContractSchema = v.object({
  id: v.string(),
  state: ContractStateSchema,
  reference: v.string(),
  clearing_processor: v.string(),
  member_id: v.string(),
  bluecode_id: v.string(),
  contract_number: v.string(),
  issuer_code: v.string(),
  limit_per_tx: v.nullish(v.string()),
})

export const StrippedContractSchema = v.object({
  id: v.number(),
  contractNumber: v.string(),
  bluecodeReference: v.string(),
  state: ContractStateSchema,
})

export type StrippedContract = v.InferOutput<typeof StrippedContractSchema>

export type Contract = v.InferOutput<typeof ContractSchema>

export const SessionSchema = v.object({
  session_token: v.string(),
  expires: v.number(),
})

export type Session = v.InferOutput<typeof SessionSchema>

export const CreateCardSchema = v.object({
  id: v.string(),
  reference: v.string(),
  contract_number: v.string(),
  wallet_id: v.string(),
  legacy_app_id: v.string(),
})

export type CreateCard = v.InferOutput<typeof CreateCardSchema>

export const CardSchema = v.omit(
  v.object({
    ...CreateCardSchema.entries,
    state: v.string(),
    inserted_at: v.date(),
    user_agent: v.string(),
    deleted_at: v.nullable(v.date()),
    card_type: v.null(),
    wallet_reference: v.string(),
  }),
  ['legacy_app_id', 'contract_number'],
)

export const StrippedCardSchema = v.object({
  cardNumber: v.string(),
  bluecodeReference: v.string(),
  id: v.number(),
})

export type StrippedCard = v.InferOutput<typeof StrippedCardSchema>

export type Card = v.InferOutput<typeof CardSchema>

// Clearing API

const StringToNumberTransformer = v.pipe(v.string(), v.transform(val => Number(val)))

export const ClearingPaymentRequestSchema = v.object({
  contract_number: v.string(),
  amount: StringToNumberTransformer,
  currency: v.pipe(v.string(), v.minLength(3), v.maxLength(3)),
  purpose: v.nullish(v.string()),
  bc_tx_id: v.string(),
  bc_txevent_id: v.string(),
  prev_bc_txevent_id: v.nullish(v.string()),
  bc_txevent_time: StringToNumberTransformer,
  tx_type: v.union([
    v.literal('POS'),
    v.literal('ECM'),
    v.literal('MCM'),
    v.literal('VMT'),
  ]),
  prev_issuer_txevent_ref: v.nullish(v.string()),
  acquirer: v.string(),
  acquirer_tx_ref: v.string(),
  acquirer_txevent_ref: v.nullish(v.string()),
  acquirer_country: v.pipe(v.string(), v.minLength(2), v.maxLength(2)),
  issuer: v.string(),
  issuer_tx_ref: v.nullish(v.string()),
  merchant_id: v.nullish(v.string()),
  merchant_name: v.string(),
  merchant_country: v.pipe(v.string(), v.minLength(2), v.maxLength(2)),
  merchant_category_code: v.nullish(StringToNumberTransformer),
  merchant_tx_ref: v.nullish(v.string()),
  branch: v.nullish(v.string()),
  branch_address: v.nullish(v.string()),
})

export const ClearingPreAuthRequestSchema = v.omit(
  v.object({
    ...ClearingPaymentRequestSchema.entries,
    valid_until: StringToNumberTransformer,
  }),
  ['prev_bc_txevent_id', 'prev_issuer_txevent_ref', 'issuer_tx_ref']
)

export const ClearingExtendPreAuthRequestSchema = v.object({
  ...ClearingPaymentRequestSchema.entries,
  valid_until: StringToNumberTransformer,
})

export const ClearingReleasePreAuthRequestSchema = v.omit(
  ClearingPaymentRequestSchema,
  ['amount', 'currency', 'purpose', 'merchant_tx_ref']
)

export const ClearingRefundRequestSchema = v.object({
  ...ClearingPaymentRequestSchema.entries,
  target_bc_tx_id: v.string(),
})

export const ClearingCreditRequestSchema = v.omit(
  v.object({
    ...ClearingPaymentRequestSchema.entries,
    credit_reason: v.union([
      v.literal('deposit'),
      v.literal('gamble'),
      v.literal('transfer'),
      v.literal('credit'),
    ]),
    pos_entry_mode: v.union([
      v.literal('scan'),
      v.literal('keyentry'),
    ]),
  }),
  ['prev_issuer_txevent_ref', 'issuer_tx_ref', 'merchant_tx_ref']
)

export type ClearingPaymentRequest = v.InferInput<typeof ClearingPaymentRequestSchema>
export type ClearingCancelRequest = v.InferInput<typeof ClearingPaymentRequestSchema>
export type ClearingPreAuthRequest = v.InferInput<typeof ClearingPreAuthRequestSchema>
export type ClearingExtendPreAuthRequest = v.InferInput<typeof ClearingExtendPreAuthRequestSchema>
export type ClearingReleasePreAuthRequest = v.InferInput<typeof ClearingReleasePreAuthRequestSchema>
export type ClearingRefundRequest = v.InferInput<typeof ClearingRefundRequestSchema>
export type ClearingCreditRequest = v.InferInput<typeof ClearingCreditRequestSchema>
