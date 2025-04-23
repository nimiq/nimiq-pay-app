import * as v from 'valibot'

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

export type Card = v.InferOutput<typeof CardSchema>
