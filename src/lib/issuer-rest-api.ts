import { parse } from 'valibot'
import { useLogger } from '../composables/useLogger'
import { useLocalWallet } from '../stores/local-wallet'
import {
  type AuthCompleteRequest,
  AuthCompleteResponseSchema,
  type AuthStartRequest,
  AuthStartResponseSchema,
  UserStatusResponse,
  UserStatusResponseSchema,
} from './issuer-schemas/rest.schema'
import { signMessage } from './issuer-utils'

const logger = useLogger('NakaRestApi')

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
    if (_token.expires < Date.now() - 60e3) {
      return _token.token
    }
    // Otherwise reset it
    _token = null
  }

  // Get a new token

  const { localAddress, localWallet } = useLocalWallet()

  try {
    // Request a challenge from the issuer
    const authStartRequest: AuthStartRequest = {
      address: localAddress.toUserFriendlyAddress(),
    }
    const authStartResponse = await fetch('http://127.0.0.1:8083/auth/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(authStartRequest),
    })
    const { challenge } = parse(AuthStartResponseSchema, await authStartResponse.json())

    // Sign the challenge with the local wallet
    const signature = await signMessage(localWallet, challenge)

    // Send the signed challenge back to the issuer to get a token
    const authCompleteRequest: AuthCompleteRequest = {
      challenge,
      signature: signature.toHex(),
      publicKey: localWallet.publicKey.toHex(),
    }
    const authCompleteResponse = await fetch('http://127.0.0.1:8083/auth/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(authCompleteRequest),
    })
    const { token } = parse(AuthCompleteResponseSchema, await authCompleteResponse.json())

    // Decode the token to get the expiration timestamp
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
  } catch (error) {
    logger.error('Error getting token:', error)
    throw error
  }
}

export function useIssuerRestApi() {
  async function getUserStatus(): Promise<UserStatusResponse | null> {
    const userStatusResponse = await fetch('http://127.0.0.1:8083/user/status', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${await getToken()}`,
      },
    })
    if (!userStatusResponse.ok) {
      if (userStatusResponse.status === 403) {
        // User not yet registered
        return null
      }
      throw new Error(`Error getting user status: ${await userStatusResponse.text()}`)
    }
    return parse(UserStatusResponseSchema, await userStatusResponse.json())
  }

  async function getNakaIdentificationToken(): Promise<string> {
    const nakaIdentificationTokenResponse = await fetch('http://127.0.0.1:8083/naka/identification/token', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${await getToken()}`,
      },
    })
    if (!nakaIdentificationTokenResponse.ok) {
      throw new Error(`Error getting NAKA identification token: ${await nakaIdentificationTokenResponse.text()}`)
    }
    return nakaIdentificationTokenResponse.text()
  }

  return {
    getUserStatus,
    getNakaIdentificationToken,
  }
}
