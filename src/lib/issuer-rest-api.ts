import type { BaseIssue, BaseSchema, InferOutput } from 'valibot'
import type {
  Identification,
  IdentificationTokenResponse,
  NakaCard,
  NakaEncryptedCardDataResponse,
  NakaPinChangeResponse,
  NakaPinChangeTokenResponse,
  NakaRegistrationResponse,
  UserStatusResponse,
} from '@/lib/issuer-schemas/rest.schema'
import {
  IdentificationSchema,
  IdentificationTokenResponseSchema,
  NakaCardSchema,
  NakaEncryptedCardDataResponseSchema,
  NakaPinChangeResponseSchema,
  NakaPinChangeTokenResponseSchema,
  NakaRegistrationResponseSchema,
  UserStatusResponseSchema,
} from './issuer-schemas/rest.schema'

export function useIssuerRestApi() {
  async function api<T extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(path: string, method: 'GET' | 'POST', body: string, responseSchema: T): Promise<InferOutput<T>> {
    void body
    void responseSchema
    throw new Error(`Issuer API disabled: ${method} ${path}`)
  }

  async function getUserStatus(): Promise<UserStatusResponse> {
    return api('/user/status', 'GET', '', UserStatusResponseSchema)
  }

  async function getNakaIdentificationToken(): Promise<IdentificationTokenResponse> {
    return api('/naka/identification/token', 'GET', '', IdentificationTokenResponseSchema)
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

  async function issueCard(): Promise<NakaRegistrationResponse> {
    return api('/naka/issue-card', 'POST', '', NakaRegistrationResponseSchema)
  }

  async function getSecretData(cardId: string, publicKey: string): Promise<NakaEncryptedCardDataResponse> {
    const body = JSON.stringify({
      publicKey,
    })
    return api(`/naka/card/${cardId}/secret-data`, 'POST', body, NakaEncryptedCardDataResponseSchema)
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
    issueCard,
    getSecretData,
    createFakeIdentification,
    lockNakaCard,
    unlockNakaCard,
    blockNakaCard,
    getNakaCardPinChangeToken,
    changeNakaCardPin,
  }
}
