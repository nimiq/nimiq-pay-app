import type { PublicKey, Signature } from '@nimiq/core'
import type { BaseIssue, BaseSchema, InferOutput } from 'valibot'
import { parse, string } from 'valibot'
import { useLogger } from '../composables/useLogger'
import { useLocalWallet } from '../stores/local-wallet'
import {
  type AuthCompleteRequest,
  type AuthCompleteResponse,
  AuthCompleteResponseSchema,
  type AuthStartRequest,
  type AuthStartResponse,
  AuthStartResponseSchema,
  type Identification,
  IdentificationSchema,
  type NakaCard,
  NakaCardSchema,
  type NakaPinChangeResponse,
  NakaPinChangeResponseSchema,
  type NakaPinChangeTokenResponse,
  NakaPinChangeTokenResponseSchema,
  type NakaRegistrationResponse,
  NakaRegistrationResponseSchema,
  type UserStatusResponse,
  UserStatusResponseSchema,
} from './issuer-schemas/rest.schema'
import { signMessage } from './issuer-utils'

const logger = useLogger('NakaRestApi')

const ISSUER_SERVER_ORIGIN = 'http://127.0.0.1:8083'

interface Token {
  /**
   * The JWT token
   */
  token: string
  /**
   * Expiration timestamp in milliseconds
   */
  expires: number
}

interface ApiTokenPayload {
  sub: string
  iat: number
  exp: number
}

let _token: Token | null = null

async function getToken() {
  if (_token) {
    // If token is valid for at least 1 more minute, use it
    if (_token.expires > Date.now() - 60e3) {
      return _token.token
    }
    // Otherwise reset it
    _token = null
  }

  // Get a new token

  const { localAddress, localWallet } = useLocalWallet()

  async function authApi<T extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(path: string, body: object, responseSchema: T): Promise<InferOutput<T>> {
    const res = await fetch(`${ISSUER_SERVER_ORIGIN}/auth${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    return parse(responseSchema, await res.json())
  }

  async function startAuth(address: string): Promise<AuthStartResponse> {
    const authStartRequest: AuthStartRequest = {
      address,
    }
    return authApi('/start', authStartRequest, AuthStartResponseSchema)
  }

  async function completeAuth(challenge: string, signature: Signature, publicKey: PublicKey): Promise<AuthCompleteResponse> {
    const authCompleteRequest: AuthCompleteRequest = {
      challenge,
      signature: signature.toHex(),
      publicKey: publicKey.toHex(),
    }
    return authApi('/complete', authCompleteRequest, AuthCompleteResponseSchema)
  }

  try {
    // Request a challenge from the issuer
    const { challenge } = await startAuth(localAddress.toUserFriendlyAddress())

    // Sign the challenge with the local wallet
    const signature = await signMessage(localWallet, challenge)

    // Send the signed challenge back to the issuer to get a token
    const { token } = await completeAuth(challenge, signature, localWallet.publicKey)

    // Decode the token to get the issued-at and expiration timestamps
    const payload = token.split('.')[1]
    const { iat, exp } = JSON.parse(Nimiq.BufferUtils.toUtf8(Nimiq.BufferUtils.fromBase64Url(payload))) as ApiTokenPayload

    // Calculate the expiration timestamp in the device's clock to avoid clock skew between device and server
    const validitySeconds = exp - iat
    const expires = Date.now() + validitySeconds * 1000

    _token = {
      token,
      expires,
    }

    return token
  }
  catch (error) {
    logger.error('Error getting token:', error)
    throw error
  }
}

interface ErrorResponse {
  message: string
  error: string
  statusCode: number
}

export function useIssuerRestApi() {
  async function api<T extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(path: string, method: 'GET' | 'POST', body: string, responseSchema: T): Promise<InferOutput<T>> {
    const res = await fetch(`${ISSUER_SERVER_ORIGIN}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getToken()}`,
      },
      body: method === 'GET' ? undefined : body,
    })
    if (!res.ok) {
      const body = await res.text()
      let message: string | undefined
      try {
        const json = JSON.parse(body) as ErrorResponse
        if (json.message) {
          message = json.message
        }
      }
      catch {
        // Ignore JSON parse error
      }
      if (message) {
        throw new Error(`Issuer API error: ${message}`)
      }
      throw new Error(`Issuer API error: ${await res.text()}`)
    }
    if (responseSchema.expects === 'string') {
      return parse(responseSchema, await res.text())
    }
    return parse(responseSchema, await res.json())
  }

  async function getUserStatus(): Promise<UserStatusResponse> {
    return api('/user/status', 'GET', '', UserStatusResponseSchema)
  }

  async function getNakaIdentificationToken(): Promise<string> {
    return api('/naka/identification/token', 'GET', '', string())
  }

  async function getNakaIdentificationById(id: string): Promise<Identification> {
    return api(`/naka/identification/${id}`, 'GET', '', IdentificationSchema)
  }

  async function createFakeIdentification(): Promise<Identification> {
    return api('/naka/identification/fake', 'POST', '', IdentificationSchema)
  }

  async function registerForNaka(): Promise<NakaRegistrationResponse> {
    return api('/naka/register', 'POST', '', NakaRegistrationResponseSchema)
  }

  async function lockNakaCard(cardId: string): Promise<NakaCard> {
    return api(`/naka/card/${cardId}/lock`, 'POST', '', NakaCardSchema)
  }

  async function unlockNakaCard(cardId: string): Promise<NakaCard> {
    return api(`/naka/card/${cardId}/unlock`, 'POST', '', NakaCardSchema)
  }

  async function blockNakaCard(cardId: string): Promise<NakaCard> {
    return api(`/naka/card/${cardId}/block`, 'POST', '', NakaCardSchema)
  }

  async function getNakaCardPinChangeToken(cardId: string): Promise<NakaPinChangeTokenResponse> {
    return api(`/naka/card/${cardId}/pin/token`, 'GET', '', NakaPinChangeTokenResponseSchema)
  }

  async function changeNakaCardPin(cardId: string, publicKey: string, cypher: string): Promise<NakaPinChangeResponse> {
    const body = JSON.stringify({
      publicKey,
      cypher,
    })
    return api(`/naka/card/${cardId}/pin`, 'POST', body, NakaPinChangeResponseSchema)
  }

  return {
    getUserStatus,
    getNakaIdentificationToken,
    getNakaIdentificationById,
    registerForNaka,
    createFakeIdentification,
    lockNakaCard,
    unlockNakaCard,
    blockNakaCard,
    getNakaCardPinChangeToken,
    changeNakaCardPin,
  }
}
