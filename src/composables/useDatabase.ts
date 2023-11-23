import { storeToRefs } from 'pinia'
import { useConn } from '@/stores/conn'
import { useApp } from '@/stores/app'
import type { SQLQueryArg as Arg, SQLQueryResult as Res } from '@/types/database'
import { SQLQuery } from '@/types/database'
import type { AsyncResult } from '@/types'

export function useFiatDatabase() {
  const { waitForUnlock } = useConn()
  const { db } = storeToRefs(useConn())

  return {
    getPriceAt,
    insertPrice,
  }
}
