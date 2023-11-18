import { storeToRefs } from 'pinia'
import { useConn } from '@/stores/conn'
import type { SQLQueryArg as Arg, SQLQueryResult as Res } from '@/types/database'
import { SQLQuery } from '@/types/database'
import type { AsyncResult } from '@/types'

export interface TransactionsTable {
}

enum DatabaseTxQuery = {
  Insert
}

export function useTxDatabase() {
  const { waitForUnlock } = useConn()
  const { db } = storeToRefs(useConn())

  async function selectAll<Q extends SQLQuery.GetAllTransactions>(): AsyncResult<Res[Q]> {
    const error = await waitForUnlock()
    if (error)
      return { error, data: undefined }
    const result = await db.value!.query(SQLQuery.GetAllTransactions)
    return { data: result.values as Res[Q], error: undefined }
  }

  async function insertTx<Q extends SQLQuery.InsertTransaction>(args: Arg[Q]): AsyncOption<string> {
    const { remoteAddress, peerName, raw, rail, railId, railPeerId, details, recipient, status, type, ts, amount, fee, method } = args
    const hash = method === PaymentMethod.NIM && 'hash' in args ? args.hash! : undefined
    const error = await waitForUnlock()
    if (error)
      return error
    await db.value!.run(SQLQuery.InsertTransaction, [toValue(remoteAddress), toValue(peerName), toValue(raw), toValue(rail), toValue(railId), toValue(railPeerId), toValue(details), toValue(recipient), toValue(status), toValue(type), toValue(ts), toValue(amount), toValue(fee), toValue(hash), toValue(method)])
  }

  return {
    selectAll,
    insertTx,
  }
}
