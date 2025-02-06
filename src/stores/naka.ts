import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLogger } from '../composables/useLogger'

const logger = useLogger('useNaka')

// TODO: Define this interface with a schema library to also be able to validate the data
export interface NakaRegistration {
  citizen: {
    /**
     * First name, max length: 32
     */
    name: string
    /**
     * Last name, max length: 32
     */
    surname: string
    /**
     * ISO date string: `YYYY-MM-DD`
     */
    birthDate?: string
    /**
     * City name
     */
    birthPlace?: string
    gender: 'Female' | 'Male' | 'Unspecified' | 'Unknown'
    title: 'Mr' | 'Ms'
    language: 'English' | 'Slovenian'
  }
  addresses: {
    /**
     * Each user MUST have one "PermanentResidence" address
     */
    typeId: 'PermanentResidence' | 'Work' | 'Other' | 'TemporaryResidence'
    /**
     * ISO Alpha-3 country code (3 letters)
     */
    countryCode: string
    /**
     * Max length: 128
     */
    line1: string
    /**
     * Max length: 128
     */
    line2?: string
    /**
     * Max length: 128
     */
    line3?: string
    /**
     * Max length: 32
     */
    city: string
    /**
     * Max length: 32
     */
    postOffice?: string
    /**
     * Max length: 8
     */
    zipCode: string
  }[]
  communications: {
    typeId: 'Email' | 'Mobile'
    /**
     * Max length: 64
     */
    value: string
  }[]
}

enum NakaCardStatus {
  Active = 'Active',
  ClientRequestedLock = 'ClientRequestedLock',
  LostCard = 'LostCard',
  StolenCard = 'StolenCard',
  IssuerRequestGeneral = 'IssuerRequestGeneral',
  IssuerRequestFraud = 'IssuerRequestFraud',
  IssuerRequestLegal = 'IssuerRequestLegal',
  IssuerRequestIncorrectOpening = 'IssuerRequestIncorrectOpening',
  CardDamagedOrNotWorking = 'CardDamagedOrNotWorking',
  UserRequest = 'UserRequest',
  IssuerRequestCustomerDeceased = 'IssuerRequestCustomerDeceased',
  ProductDoesNotRenew = 'ProductDoesNotRenew',
  ProductChange = 'ProductChange',
  Renewed = 'Renewed',
}

interface NakaCard {
  sourceId: string
  maskedPan?: string
  type?: 'Debit' | 'Credit'
  relationTypeId: 'Primary' | 'Business' | 'Supplementary'
  statusId: NakaCardStatus
  lockLevel: 'Client' | 'Admin'
  nameOnCard?: string
  /**
   * Format: `YYYY-MM`
   */
  expiryDate?: string
  productCode?: string
  qrCode?: string

  // Not sure where from (or if) we get these fields
  cardNumber?: string
  cvv?: string
  publicKey?: string
}

export const useNaka = defineStore('naka', () => {
  const registration = ref<NakaRegistration>()

  function setRegistration(newRegistration: NakaRegistration) {
    logger.log('setRegistration', newRegistration)
    registration.value = newRegistration
  }

  // TODO: Initialize card from DB
  const card = ref<NakaCard>()

  function setCard(newCard: NakaCard) {
    logger.log('setCard', newCard)
    // TODO: Set card in DB
    card.value = newCard
  }

  function setDummyCard() {
    logger.log('setDummyCard')
    return setCard({
      sourceId: 'dummy-card-01',
      maskedPan: '123456*****1234',
      type: 'Debit',
      relationTypeId: 'Primary',
      statusId: NakaCardStatus.Active,
      lockLevel: 'Client',
      nameOnCard: 'JOHN DOE',
      expiryDate: '2026-02',
      productCode: 'DummyDebit',
    })
  }

  function reset() {
    if (!confirm('Really delete all NAKA data?')) // eslint-disable-line no-alert
      return false
    logger.log('reset')
    registration.value = undefined
    // TODO: Delete card(s) in DB
    card.value = undefined
    return true
  }

  const hasCard = computed(() => Boolean(card.value?.sourceId))

  const hasActiveCard = computed(() => card.value?.statusId === NakaCardStatus.Active)

  return {
    registration,
    setRegistration,
    card,
    setCard,
    setDummyCard,
    reset,
    hasCard,
    hasActiveCard,
  }
})
