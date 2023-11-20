import { storeToRefs } from 'pinia'
import { useConn } from '@/stores/conn'
import { useApp } from '@/stores/app'
import type { SQLQueryArg as Arg, SQLQueryResult as Res } from '@/types/database'
import { SQLQuery } from '@/types/database'
import type { AsyncResult } from '@/types'

export function useFiatDatabase() {
  const { waitForUnlock } = useConn()
  const { db } = storeToRefs(useConn())

  async function getPriceAt<Q extends SQLQuery.GetPriceAt>(timestamp: number): AsyncResult<Res[Q]> {
    const error = await waitForUnlock()
    if (error)
      return { error, data: undefined }
    const { selectedFiat } = storeToRefs(useApp())
    const result = await db.value!.query(SQLQuery.GetPriceAt, [timestamp, selectedFiat.value])
    return { data: result.values?.[0] as Res[Q], error: undefined }
  }

  async function insertPrice<Q extends SQLQuery.InsertPrice>({ currency, ts, value }: Arg[Q]) {
    const error = await waitForUnlock()
    if (error)
      return error

    await db.value!.run(SQLQuery.InsertPrice, [currency, ts, value])
  }

  return {
    getPriceAt,
    insertPrice,
  }
}
