import type { IdentificationTokenResponse } from '@/lib/issuer-schemas/rest.schema'
import { until, useStorageAsync } from '@vueuse/core'
import { SumsubMobileSdk, SumsubSdkStatus } from 'capacitor-sumsub-mobile-sdk'
import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { isDev } from '@/lib'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { kv, useApp } from '@/stores/app'

const logger = useLogger('useKyc')
const { language } = storeToRefs(useApp())
const { getNakaIdentificationToken } = useIssuerRestApi()

/**
 * Represents the various error types that can occur during the KYC verification process.
 * These errors are returned by the SumSub SDK when something goes wrong.
 */
export enum SumsubErrorType {
  /** Unknown or no fail */
  Unknown = 'Unknown',
  /** An attempt to setup with invalid parameters */
  InvalidParameters = 'InvalidParameters',
  /** Unauthorized access detected (most likely accessToken is invalid or expired and had failed to be refreshed) */
  Unauthorized = 'Unauthorized',
  /** Initial loading from backend is failed */
  InitialLoadingFailed = 'InitialLoadingFailed',
  /** No applicant is found for the given parameters */
  ApplicantNotFound = 'ApplicantNotFound',
  /** Applicant is found, but is misconfigured (most likely lacks of idDocs) */
  ApplicantMisconfigured = 'ApplicantMisconfigured',
  /** An initialization error occurred */
  InitializationError = 'InitializationError',
  /** A network error occurred (the user will be presented with Network Oops screen) */
  NetworkError = 'NetworkError',
  /** Some unexpected error occurred (the user will be presented with Fatal Oops screen) */
  UnexpectedError = 'UnexpectedError',
}

export const useKyc = defineStore('kyc', () => {
  const sdkStatus = ref<SumsubSdkStatus>(SumsubSdkStatus.NOT_INITIALIZED)
  const onKycApproved = ref<() => Promise<void>>()
  const accessToken = useStorageAsync<IdentificationTokenResponse>('sumsubAccessToken', { token: '', tokenExpiresAt: '' }, kv(), { writeDefaults: false })

  async function initializeSdk() {
    try {
      // TODO: improve this logic, a bit ugly
      const tokenExpiry = new Date(accessToken.value.tokenExpiresAt || 0)
      if (tokenExpiry > new Date()) {
        logger.log('Using stored Sumsub access token, expires at', tokenExpiry.toISOString())
      }
      else {
        logger.log('Stored Sumsub access token expired at', tokenExpiry.toISOString())
        await updateNakaIdentificationToken()
      }
    }
    catch (error) {
      if (error instanceof Error && error.message.includes('User already has a verified identification')) {
        return logger.log('User already has a verified identification, skipping token retrieval')
      }
      logger.error('Error getting Naka identification token:', error)
      // TODO: display error
      throw error
    }

    if (!accessToken.value.token) {
      throw new Error('No access token available for Sumsub SDK initialization')
    }

    registerListeners()

    const { status } = await SumsubMobileSdk.initialize({
      accessToken: accessToken.value.token,
      debug: isDev,
      locale: language.value,
      isAnalyticsEnabled: false,
    })
    sdkStatus.value = status
    logger.log('Sumsub SDK initialized with status:', sdkStatus.value)
  }

  async function openKycFlow() {
    logger.log('Opening KYC flow')
    await SumsubMobileSdk.present()
  }

  function registerListeners() {
    SumsubMobileSdk.addListener('onTokenExpired', async () => {
      logger.log('Token expired event')
      await updateNakaIdentificationToken()
    })

    SumsubMobileSdk.addListener('onVerificationStatusChanged', (status) => {
      logger.log('Status changed event:', status)
      sdkStatus.value = status.newStatus
    })

    SumsubMobileSdk.addListener('onApprovedStatusChanged', ({ isApproved }) => {
      logger.log('Approval changed event:', isApproved)
      if (isApproved && onKycApproved.value) {
        onKycApproved.value()
      }
    })

    SumsubMobileSdk.addListener('onEvent', (event) => {
      logger.log('Event received:', event)
    })

    SumsubMobileSdk.addListener('onLog', (event) => {
      logger.log('Log received:', event)
    })
  }

  async function updateNakaIdentificationToken() {
    logger.log('Updating Naka identification token')
    accessToken.value = { token: '', tokenExpiresAt: '' }
    try {
      accessToken.value = await getNakaIdentificationToken()
      await SumsubMobileSdk.setAccessToken({ token: accessToken.value.token })
    }
    catch (error) {
      if (error instanceof Error && error.message.includes('User already has an identification')) {
        return logger.log('User already has an identification, skipping token retrieval')
      }
      logger.error('Error getting Naka identification token:', error)
      // TODO: display error
      throw error
    }
  }

  return {
    sdkStatus,
    initializeSdk,
    openKycFlow,
    onKycApproved,
    waitForStatusApproved: async () => await until(sdkStatus).toBe(SumsubSdkStatus.APPROVED),
  }
})
