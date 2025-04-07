import * as v from 'valibot'
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

export const NakaCardSchema = v.pipe(
  v.object({
    maskedPan: v.string(),
    expiry: v.string(),
    type: v.union([
      v.literal('PHYSICAL'),
      v.literal('VIRTUAL'),
    ]),
    createdAt: v.string(),
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
