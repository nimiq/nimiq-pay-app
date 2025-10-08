import * as v from 'valibot'
import { ContractStateSchema } from './bluecode-issuer.schema'
import { HexStringSchema, NimiqAddressSchema } from './common.schema'

/** AUTH */

export const AuthStartRequestSchema = v.pipe(
  v.object({
    address: v.pipe(NimiqAddressSchema, v.description('User\'s local wallet address')),
  }),
)

export type AuthStartRequest = v.InferOutput<typeof AuthStartRequestSchema>

export const AuthStartResponseSchema = v.pipe(
  v.object({
    challenge: v.string(),
  }),
)

export type AuthStartResponse = v.InferOutput<typeof AuthStartResponseSchema>

export const AuthCompleteRequestSchema = v.pipe(
  v.object({
    challenge: v.pipe(v.string(), v.description('Same as in auth start response')),
    signature: v.pipe(HexStringSchema, v.description('Hex-encoded signature of the challenge using the user\'s local private key')),
    publicKey: v.pipe(HexStringSchema, v.description('Hex-encoded user\'s local public key')),
  }),
)

export type AuthCompleteRequest = v.InferOutput<typeof AuthCompleteRequestSchema>

export const AuthCompleteResponseSchema = v.pipe(
  v.object({
    token: v.string(),
  }),
)

export type AuthCompleteResponse = v.InferOutput<typeof AuthCompleteResponseSchema>

/** USER */

export const UserStateSchema = v.union([
  v.literal('ACTIVE'),
  v.literal('INACTIVE'),
  v.literal('BANNED'),
])

export const IdentificationSchema = v.pipe(
  v.object({
    provider: v.union([
      v.literal('NAKA-SUMSUB'),
    ]),
    id: v.string(), // ID is ok to return, as it's the external KYC-provider ID, not an internal database ID
    status: v.union([
      v.literal('INITIALIZED'),
      v.literal('PENDING'),
      v.literal('RETRYING'),
      v.literal('REJECTED'),
      v.literal('FAILED'),
      v.literal('VERIFIED'),
    ]),
    lastUpdated: v.string(),
    firstName: v.nullable(v.string()),
    middleName: v.nullable(v.string()),
    lastName: v.nullable(v.string()),
    email: v.nullable(v.string()),
  }),
)

export type Identification = v.InferOutput<typeof IdentificationSchema>

export const IdentificationTokenResponseSchema = v.pipe(
  v.object({
    token: v.string(),
    tokenExpiresAt: v.string(), // ISO date string
  }),
)

export type IdentificationTokenResponse = v.InferOutput<typeof IdentificationTokenResponseSchema>

export const NakaCardSchema = v.pipe(
  v.object({
    id: v.string(),
    maskedPan: v.string(),
    status: v.union([
      v.literal('ACTIVE'),
      v.literal('BLOCKED'),
      v.literal('TEMPORARY_BLOCKED'),
      v.literal('REPLACED'),
      v.literal('DELETED'),
      v.literal('ACCOUNT_BLOCKED'),
      v.literal('IN_CREATION'),
    ]),
    activationCode: v.nullable(v.string()),
    lockLevel: v.nullable(v.union([
      v.literal('CLIENT'),
      v.literal('ADMIN'),
    ])),
    expiry: v.string(),
    type: v.union([
      v.literal('PHYSICAL'),
      v.literal('VIRTUAL'),
    ]),
    createdAt: v.string(),
    updatedAt: v.string(),
  }),
)

export type NakaCard = v.InferOutput<typeof NakaCardSchema>

export const NakaRegistrationSchema = v.pipe(
  v.object({
    identification: v.pipe(
      v.string(),
      v.description('ID of the identification linked to the Naka registration'),
    ),
    cards: v.array(NakaCardSchema),
  }),
)

export type NakaRegistration = v.InferOutput<typeof NakaRegistrationSchema>

export const UserStatusResponseSchema = v.pipe(
  v.object({
    address: v.string(),
    state: UserStateSchema,
    identifications: v.array(IdentificationSchema),
    naka: v.optional(NakaRegistrationSchema),
  }),
)

export type UserStatusResponse = v.InferOutput<typeof UserStatusResponseSchema>

/** NAKA */

export const NakaRegistrationResponseSchema = v.pipe(
  NakaRegistrationSchema,
)

export type NakaRegistrationResponse = v.InferOutput<typeof NakaRegistrationResponseSchema>

export const NakaPinChangeTokenResponseSchema = v.pipe(
  v.object({
    publicKey: v.string(),
    expiry: v.string(),
  }),
)

export type NakaPinChangeTokenResponse = v.InferOutput<typeof NakaPinChangeTokenResponseSchema>

export const NakaPinChangeRequestSchema = v.pipe(
  v.object({
    publicKey: v.string(),
    cypher: v.string(),
  }),
)
export type NakaPinChangeRequest = v.InferOutput<typeof NakaPinChangeRequestSchema>

export const NakaPinChangeResponseSchema = v.pipe(
  v.string(),
  v.description('OK'),
)

export type NakaPinChangeResponse = v.InferOutput<typeof NakaPinChangeResponseSchema>

export const NakaEncryptedCardDataRequestSchema = v.pipe(
  v.object({
    publicKey: v.string(),
  }),
)
export type NakaEncryptedCardDataRequest = v.InferOutput<typeof NakaEncryptedCardDataRequestSchema>

export const NakaEncryptedCardDataResponseSchema = v.pipe(
  v.object({
    cypher: v.string(),
  }),
)

export type NakaEncryptedCardDataResponse = v.InferOutput<typeof NakaEncryptedCardDataResponseSchema>

/** Bluecode */

export const BluecodeUpdateContractRequestSchema = v.object({
  state: v.optional(
    ContractStateSchema,
  ),
})

export type BluecodeUpdateContractRequest = v.InferOutput<typeof BluecodeUpdateContractRequestSchema>

export const BluecodeCreateSessionRequestSchema = v.object({
  cardRequestToken: v.string(),
  expires: v.pipe(
    v.number(),
    v.minValue(86400),
    v.maxValue(604800),
  ),
})

export type BluecodeCreateSessionRequest = v.InferOutput<typeof BluecodeCreateSessionRequestSchema>

export const BluecodeCreateCardRequestSchema = v.object({
  cardRequestToken: v.string(),
})

export type BluecodeCreateCardRequest = v.InferOutput<typeof BluecodeCreateCardRequestSchema>
