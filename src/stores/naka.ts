import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLogger } from '../composables/useLogger'
import { SQLQuery } from '../lib/sql-queries'
import { useConn } from './conn'

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

export enum NakaCardStatus {
  // Undocumented
  Active = 'Active',
  Expired = 'Expired',

  // Documented
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
  expiryDate: string
  productCode?: string
  qrCode?: string

  // Not sure where from (or if) we get these fields
  cardNumber?: string
  cvv?: string
  publicKey?: string
}

export function useNakaDb() {
  const { run, query } = useConn()
  return {
    async insertNakaCard({ sourceId, statusId, expiryDate, ...meta }: NakaCard) {
      // Validate expiryDate
      const expiryDateRegex = /^\d{4}-\d{2}$/
      if (!expiryDate.match(expiryDateRegex)) {
        throw new Error('Invalid expiry date format')
      }

      // Validate meta
      if (typeof meta !== 'object' || meta === null) {
        throw new Error('Invalid meta, must be an object')
      }
      let metaJson: string
      try {
        metaJson = JSON.stringify(meta)
      }
      catch (e) { // eslint-disable-line unused-imports/no-unused-vars
        throw new Error('Invalid meta, must be a JSON-serializable object')
      }

      // Insert the card into the database
      logger.log('✒️ Adding Naka card to DB', { sourceId, statusId, expiryDate, meta })
      await run(SQLQuery.InsertNakaCard, [sourceId, statusId, expiryDate, metaJson])
    },
    async getAllNakaCards() {
      const rows = await query<{
        sourceId: string
        statusId: string
        expiryDate: string
        meta: string
      }[]>(SQLQuery.GetAllNakaCards)

      return rows.map(({ sourceId, statusId, expiryDate, meta }) => {
        const extraFields = JSON.parse(meta) as Omit<NakaCard, 'sourceId' | 'statusId' | 'expiryDate'>
        return { sourceId, statusId, expiryDate, ...extraFields } as NakaCard
      })
    },
    async purgeNakaCards() {
      logger.log('🗑️ Purging Naka cards from DB')
      await run(SQLQuery.PurgeNakaCards)
    },
  }
}

export const useNaka = defineStore('naka', () => {
  const { getAllNakaCards, insertNakaCard, purgeNakaCards } = useNakaDb()

  const registration = ref<NakaRegistration>()

  function setRegistration(newRegistration: NakaRegistration) {
    logger.log('setRegistration', newRegistration)
    registration.value = newRegistration
  }

  const card = ref<NakaCard>()

  function setCard(newCard: NakaCard) {
    logger.log('setCard', newCard)
    insertNakaCard(newCard)
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

  async function reset() {
    if (!confirm('Really delete all NAKA data?')) // eslint-disable-line no-alert
      return false
    logger.log('reset')
    registration.value = undefined
    await purgeNakaCards()
    card.value = undefined
    return true
  }

  const hasCard = computed(() => Boolean(card.value?.sourceId))

  const hasActiveCard = computed(() => card.value?.statusId === NakaCardStatus.Active)

  async function init() {
    const dbCards = await getAllNakaCards()
    if (dbCards.length === 0)
      return

    if (dbCards.length === 1) {
      card.value = dbCards[0]
    }
    else {
      dbCards.sort((a, b) => {
        const aExpiry = Number.parseInt(a.expiryDate.replace('-', ''), 10)
        const bExpiry = Number.parseInt(b.expiryDate.replace('-', ''), 10)
        // Sort decending (latest expiry first)
        return bExpiry - aExpiry
      })
      // Use the newest card
      card.value = dbCards[0]
    }

    logger.log('init', card.value)

    // TODO: Check card status against issuer API

    if (card.value.statusId === NakaCardStatus.Active) {
      // Check expiry
      const today = Number.parseInt(`${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString(10).padStart(2, '0')}`.replace('-', ''), 10)
      const expiry = Number.parseInt(card.value.expiryDate.replace('-', ''), 10)

      if (today > expiry) {
        logger.log('Card expired', { today, expiry })
        card.value.statusId = NakaCardStatus.Expired
        await insertNakaCard(card.value)
      }
    }
  }

  const isFrozen = ref(false)

  return {
    registration,
    setRegistration,
    card,
    setCard,
    setDummyCard,
    reset,
    hasCard,
    hasActiveCard,
    init,
    isFrozen,
  }
})
