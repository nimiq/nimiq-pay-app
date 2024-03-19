import { computed, ref } from 'vue'
import { watchOnce } from '@vueuse/core'
import { useFuse } from '@vueuse/integrations/useFuse'
import { useConn } from '@/stores/conn'
import { SQLQuery } from '@/lib/sql-queries'
import { type ExternalTransaction, translateTransactionTitle } from '@/types/transactions'

export function useTransactionSearch() {
  const searchQuery = ref('')
  const { query } = useConn()

  const allTransactions = ref<ExternalTransaction[]>([])

  watchOnce(searchQuery, async () => {
    const txs = await query<ExternalTransaction[]>(SQLQuery.SelectAllTransactions)
    // Convert JSON strings to objects
    txs.forEach((tx) => {
      tx.invoiced = tx.invoiced ? JSON.parse(tx.invoiced as unknown as string) as { amount: number; currency: string } : undefined
      tx.meta = tx.meta ? JSON.parse(tx.meta as unknown as string) as Record<string, any> : undefined
    })
    allTransactions.value = txs
  })

  const { results: filteredTransactions } = useFuse(searchQuery, allTransactions, { fuseOptions: {
    keys: [{
      name: 'title',
      getFn: (tx: ExternalTransaction) => translateTransactionTitle(tx.title),
    }, /* untranslated title */ 'title', 'message', 'merchantName', 'merchantCategory', 'amount'],
    sortFn: ({ item: a }: { item: ExternalTransaction }, { item: b }: { item: ExternalTransaction }) => (b.timestamp as number) - (a.timestamp as number),
    ignoreLocation: true,
  } })

  return {
    searchQuery,
    filteredTransactions: computed(() => filteredTransactions.value.map(res => res.item)),
    allTransactions,
  }
}
