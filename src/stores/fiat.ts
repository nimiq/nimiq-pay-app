import { defineStore, storeToRefs } from 'pinia'
import { ref, toValue } from 'vue'
import { useApp } from './app'
import { useDevice } from '@/composables/useDevice'
import { useCurrencyPriceApi } from '@/composables/useApi'
import type { AsyncResult } from '@/types'
import type { Transaction, TransactionDb } from '@/types/transactions'
import { useConn } from '@/stores/conn'
import { SQLQuery } from '@/lib/sql-queries'

export interface PriceTable {
  currency: string
  ts: number
  value: number
}

export const useFiat = defineStore('fiat', () => {
  const { run, query } = useConn()
  const { selectedFiat } = storeToRefs(useApp())
  const { locale } = useDevice()
  const { getPriceAt: priceAtApi, getPriceNow: getPriceNowApi } = useCurrencyPriceApi()

  // TODO: add price for new currency if it doesnt exist
  // watch(selectedFiat, () => selectedFiat.value && upsertKV({ key: 'fiatPrice', value: currency.value }))

  function formatCurrency(value: number) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: selectedFiat.value }).format(value)
  }

  // The price of NIM every 10 minutes
  const prices = ref<Record<number /* ts */, number /* value */>>({})

  async function getPriceDb(timestamp: number) {
    return await query<PriceTable | undefined>(SQLQuery.GetPriceAt, [timestamp, selectedFiat.value], { single: true })
  }

  /**
   * Insert a price into the database. The timestamp is rounded to the nearest 10 minutes.
   */
  async function insertPrice({ currency, ts, value }: PriceTable) {
    await run(SQLQuery.InsertPrice, [currency, ts, value])
  }

  async function getPriceAt(ts: number): AsyncResult<number> {
    const rounded = Math.floor(ts / 600000) * 600
    const cachedPrice = prices.value[rounded]
    if (cachedPrice !== undefined)
      return { data: cachedPrice, error: undefined }

    const priceDb = await getPriceDb(rounded)
    if (priceDb)
      return { data: priceDb.value, error: undefined }

    const { data: priceFromApi, error: priceAtError } = await priceAtApi({ currency: selectedFiat.value, timestamp: rounded })
    if (priceFromApi === undefined)
      return { data: undefined, error: priceAtError }

    await insertPrice({ currency: selectedFiat.value, ts: rounded, value: priceFromApi.price })

    prices.value[rounded] = priceFromApi.price
    return { data: priceFromApi.price, error: undefined }
  }

  async function getPriceNow(): AsyncResult<number> {
    // TODO: parallelize
    const { data: priceCurrency, error } = await getPriceNowApi({ currency: selectedFiat.value })
    const { data: priceNIM, error: priceNIMError } = await getPriceNowApi({ currency: 'NIM' })
    if (error !== undefined)
      return { data: undefined, error }
    if (priceNIMError !== undefined)
      return { data: undefined, error: priceNIMError }

    return { data: priceCurrency.price * priceNIM.price, error: undefined }
  }

  async function getTxPrice({ value, timestamp }: TransactionDb): Promise<Pick<Transaction, 'fiatUnit' | 'fiatAmount'>> {
    return {
      fiatUnit: selectedFiat.value,
      fiatAmount: toValue(await getPriceAt(timestamp)).data! * value,
    }
  }

  return {
    formatCurrency,
    getPriceAt,
    getPriceNow,
    getTxPrice,
  }
})
