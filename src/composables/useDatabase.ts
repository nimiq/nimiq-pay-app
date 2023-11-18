import { storeToRefs } from 'pinia'
import { useConn } from '@/stores/conn'
import { useApp } from '@/stores/app'
import type { SQLQueryArg as Arg, SQLQueryResult as Res } from '@/types/database'
import { SQLQuery } from '@/types/database'
import type { AsyncResult } from '@/types'

// export function useWalletDatabase() {
//   const { waitForUnlock } = useConn()
//   const { db } = storeToRefs(useConn())

//   async function selectWallet<Q extends SQLQuery.SelectActiveWallet>(): AsyncResult<Res[Q]> {
//     await waitForUnlock()
//     if (!db.value)
//       return { error: 'The db instance is not defined', data: undefined }

//     const result = await db.value!.query(SQLQuery.SelectActiveWallet, [])
//     if (!result.values || result.values?.length === 0)
//       return { error: 'No wallet found', data: undefined }

//     return { data: result.values[0] as Res[Q], error: undefined }
//   }

//   async function insertWallet<Q extends SQLQuery.InsertWallet>({ address, start, end, proofSize, active, balance, type, status }: Arg[Q]) {
//     const error = await waitForUnlock()
//     if (error)
//       return error
//     await db.value!.run(SQLQuery.InsertWallet, [address, type, status, balance, start, end, proofSize, active])
//   }

//   async function updateWallet<Q extends SQLQuery.UpdateWallet>({ start, end, proofSize, address, active, balance, type, status }: Arg[Q]) {
//     const error = await waitForUnlock()
//     if (error)
//       return error
//     await db.value!.run(SQLQuery.UpdateWallet, [type, status, balance, start, end, proofSize, active, address])
//   }

//   async function deactivateWallet<Q extends SQLQuery.DeactivateWallet>(id: Arg[Q]) {
//     await waitForUnlock()
//     await db.value!.run(SQLQuery.DeactivateWallet, [toValue(id)])
//   }

//   return {
//     selectWallet,
//     insertWallet,
//     updateWallet,
//     deactivateWallet,
//   }
// }

// export function useTxDatabase() {
//   const { waitForUnlock } = useConn()
//   const { db } = storeToRefs(useConn())

//   async function selectAll<Q extends SQLQuery.GetAllTransactions>(): AsyncResult<Res[Q]> {
//     const error = await waitForUnlock()
//     if (error)
//       return { error, data: undefined }
//     const result = await db.value!.query(SQLQuery.GetAllTransactions)
//     return { data: result.values as Res[Q], error: undefined }
//   }

//   async function insertTx<Q extends SQLQuery.InsertTransaction>(args: Arg[Q]): AsyncOption<string> {
//     const { remoteAddress, peerName, raw, rail, railId, railPeerId, details, recipient, status, type, ts, amount, fee, method } = args
//     const hash = method === PaymentMethod.NIM && 'hash' in args ? args.hash! : undefined
//     const error = await waitForUnlock()
//     if (error)
//       return error
//     await db.value!.run(SQLQuery.InsertTransaction, [toValue(remoteAddress), toValue(peerName), toValue(raw), toValue(rail), toValue(railId), toValue(railPeerId), toValue(details), toValue(recipient), toValue(status), toValue(type), toValue(ts), toValue(amount), toValue(fee), toValue(hash), toValue(method)])
//   }

//   return {
//     selectAll,
//     insertTx,
//   }
// }

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
