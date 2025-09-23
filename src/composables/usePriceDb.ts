import type { MaybeRef } from 'vue'
import { toValue } from 'vue'
import { SQLQuery } from '@/lib/sql-queries'
import { useConn } from '@/stores/conn'

export interface PriceTable {
  // The fiat currency
  fiat: MaybeRef<string>

  // The crypto currency
  crypto: MaybeRef<string>

  // The price of 1 NIM in the fiat currency
  price: MaybeRef<number>

  // The timestamp of the price. It is rounded to the nearest 10 minutes
  checkpoint: number
}

export function usePriceDb() {
  const { run, query } = useConn()

  async function insertPrice({ fiat, crypto, checkpoint, price }: PriceTable) {
    await run(SQLQuery.InsertPrice, [toValue(fiat), checkpoint, toValue(price), toValue(crypto)])
  }

  async function getPriceDb({ crypto, fiat, checkpoint }: Pick<PriceTable, 'fiat' | 'checkpoint' | 'crypto'>) {
    return await query<PriceTable | undefined>(SQLQuery.GetPriceAt, [checkpoint, toValue(fiat), toValue(crypto)], { single: true })
  }

  async function getClosestPreviousPrice({ crypto, fiat, checkpoint }: Pick<PriceTable, 'fiat' | 'checkpoint' | 'crypto'>) {
    return await query<PriceTable | undefined>(SQLQuery.GetClosestPreviousPrice, [checkpoint, toValue(fiat), toValue(crypto)], { single: true })
  }

  return {
    insertPrice,
    getPriceDb,
    getClosestPreviousPrice,
  }
}
