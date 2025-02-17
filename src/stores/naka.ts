import type { NakaCard as ApiNakaCard, Identification, UserStatusResponse } from '../lib/issuer-schemas/rest.schema'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLogger } from '../composables/useLogger'
import { SQLQuery } from '../lib/sql-queries'
import { useConn } from './conn'

const logger = useLogger('useNaka')

export interface CardExpiry {
  year: number
  month: number
}

// TODO: Derive from or directly use rest.schema's NakaCard type
export interface NakaCard {
  sourceId: string
  maskedPan: string
  activationCode?: string | null
  statusId: ApiNakaCard['status'] | 'EXPIRED'
  expiry: CardExpiry
  lockLevel: ApiNakaCard['lockLevel']
  type: ApiNakaCard['type']
}

export function nakaCardFromApi(apiCard: ApiNakaCard): NakaCard {
  const expiryDate = new Date(apiCard.expiry)
  const expiry = { year: expiryDate.getUTCFullYear(), month: expiryDate.getUTCMonth() + 1 }

  return {
    sourceId: apiCard.id,
    maskedPan: apiCard.maskedPan,
    statusId: apiCard.status,
    activationCode: apiCard.activationCode,
    expiry,
    lockLevel: apiCard.lockLevel,
    type: apiCard.type,
  }
}

function expiryToDb(expiry: CardExpiry): string {
  return `${expiry.year}-${expiry.month.toString(10).padStart(2, '0')}`
}

function expiryFromDb(expiry: string): CardExpiry {
  const [year, month] = expiry.split('-').map(Number)
  return { year, month }
}

export function useNakaDb() {
  const { run, query } = useConn()
  return {
    async insertNakaCard({ sourceId, statusId, expiry, ...meta }: NakaCard) {
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
      logger.log('✒️ Adding Naka card to DB', { sourceId, statusId, expiry, meta })
      await run(SQLQuery.InsertNakaCard, [sourceId, statusId, expiryToDb(expiry), metaJson])
    },
    async getAllNakaCards() {
      const rows = await query<{
        sourceId: string
        statusId: string
        expiryDate: string
        meta: string
      }[]>(SQLQuery.GetAllNakaCards)

      return rows.map(({ sourceId, statusId, expiryDate, meta }) => {
        const extraFields = JSON.parse(meta) as Omit<NakaCard, 'sourceId' | 'statusId' | 'expiry'>
        return { sourceId, statusId: statusId as NakaCard['statusId'], expiry: expiryFromDb(expiryDate), ...extraFields } satisfies NakaCard
      })
    },
    async purgeNakaCards() {
      logger.log('🗑️ Purging Naka cards from DB')
      await run(SQLQuery.PurgeNakaCards)
    },
  }
}

export interface NakaRegistration {
  state: UserStatusResponse['state']
  nakaIdentification?: Identification
  nakaCards: NakaCard[]
}

export const useNaka = defineStore('naka', () => {
  const { getAllNakaCards, insertNakaCard, purgeNakaCards } = useNakaDb()

  const registration = ref<NakaRegistration>()

  function setRegistration(newRegistration: NakaRegistration) {
    logger.log('setRegistration', newRegistration)
    registration.value = newRegistration
  }

  const card = ref<NakaCard>()

  async function setCard(newCard: NakaCard) {
    logger.log('setCard', newCard)
    await insertNakaCard(newCard)
    card.value = newCard
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
  const isCardActive = computed(() => card.value?.statusId === 'ACTIVE')
  const isCardLocked = computed(() => card.value?.lockLevel !== null)
  const isCardBlocked = computed(() => card.value?.statusId === 'BLOCKED')

  async function init() {
    const dbCards = await getAllNakaCards()
    if (dbCards.length === 0)
      return

    if (dbCards.length === 1) {
      card.value = dbCards[0]
    }
    else {
      dbCards.sort((a, b) => {
        // Sort decending (latest expiry first)
        return (b.expiry.year - a.expiry.year) || (b.expiry.month - a.expiry.month)
      })
      // Use the newest card
      card.value = dbCards[0]
    }

    logger.log('init', card.value)

    // TODO: Check card status against issuer API?

    if (card.value.statusId === 'ACTIVE') {
      // Check expiry
      if (
        card.value.expiry.year < new Date().getUTCFullYear()
        || (
          card.value.expiry.year === new Date().getUTCFullYear()
          && card.value.expiry.month < new Date().getUTCMonth() + 1
        )
      ) {
        logger.log('Card expired', card.value.expiry)
        card.value.statusId = 'EXPIRED'
        await insertNakaCard(card.value)
      }
    }
  }

  // We need to update the following components: NakaCardDelete.vue and NakaCardManagement.vue with the code for deleting/adding new card

  const isFrozen = ref(false)

  const dailyLimit = ref<number>()
  function setDailyLimit(limit: number) {
    dailyLimit.value = limit
  }

  const paymentLimit = ref<number>()
  function setPaymentLimit(limit: number) {
    paymentLimit.value = limit
  }

  return {
    registration,
    setRegistration,
    card,
    setCard,
    reset,
    hasCard,
    isCardActive,
    isCardLocked,
    isCardBlocked,
    init,
    isFrozen,
    isBlocked: computed(() => isFrozen.value),
    updateFrozenStatus,

    dailyLimit,
    setDailyLimit,

    paymentLimit,
    setPaymentLimit,
  }
})
