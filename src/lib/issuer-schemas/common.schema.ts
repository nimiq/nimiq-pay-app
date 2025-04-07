import { ValidationUtils } from '@nimiq/utils/validation-utils'
import * as v from 'valibot'

export const NimiqAddressSchema = v.pipe(
  v.string(),
  v.regex(/^NQ(\d{2})( ?[0-9A-Z]{4}){8}$/),
  v.custom((value: unknown) => ValidationUtils.isValidAddress(value as string)),
)
export const NimiqAmountSchema = v.pipe(
  v.string(),
  v.custom((value: unknown) => {
    try {
      return BigInt(value as string) >= 0n
    }
    catch {
      return false
    }
  }),
)
export const HexStringSchema = v.pipe(v.string(), v.hexadecimal(), v.regex(/^([0-9a-f]{2})*$/i))
export const ZeroXHexStringSchema = v.pipe(v.string(), v.regex(/^0x[0-9a-fA-F]+$/))
export const PaymentRailSchema = v.string()

export const IssuerRejectionCodeSchema = v.picklist(['INSUFFICIENT_BALANCE', 'INVALID_REQUEST', 'LIMIT_REACHED', 'UNFAIR_EXCHANGE_RATE', 'MISSING_KYC'])
export type IssuerRejectionCode = v.InferOutput<typeof IssuerRejectionCodeSchema>

export const StoreSchema = v.object({
  name: v.optional(v.string()),
  address: v.optional(v.string()),
  zipCode: v.optional(v.string()),
  city: v.optional(v.string()),
  country: v.optional(v.pipe(v.string(), v.length(2), v.description('2-letter country code'))),
})
