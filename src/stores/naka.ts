import type { NakaCard as ApiNakaCard, UserIdentification, UserStatusResponse } from '../lib/issuer-schemas/rest.schema'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLogger } from '../composables/useLogger'
import { SQLQuery } from '../lib/sql-queries'
import { useConn } from './conn'

const logger = useLogger('useNaka')

// TODO: Derive from or directly use rest.schema's NakaCard type
export interface NakaCard {
  sourceId: string
  statusId: string
  expiryDate: string
}

export enum NakaCardStatus {
  // Undocumented
  Active = 'Active',
  Expired = 'Expired',
}

export function nakaCardApiToDb(apiCard: ApiNakaCard): NakaCard {
  const sourceId = apiCard.panToken
  const statusId = NakaCardStatus.Active
  const expiryDate = `${new Date().getFullYear() + 4}-${new Date().getMonth().toString(10).padStart(2, '0')}`

  return {
    sourceId,
    statusId,
    expiryDate,
  }
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
        return { sourceId, statusId, expiryDate, ...extraFields } satisfies NakaCard
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
  identifications: UserIdentification[]
  // nakaIdentification?: UserIdentification,
  // nakaCards: NakaCard[],
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

  // We need to update the following components: NakaCardDelete.vue and NakaCardManagement.vue with the code for deleting/adding new card

  const isFrozen = ref(false)

  function updateFrozenStatus() {
    isFrozen.value = card.value?.statusId !== NakaCardStatus.Active
  }

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
    hasActiveCard,
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
