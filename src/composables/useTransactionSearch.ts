import { computed, ref } from 'vue'
import { watchOnce } from '@vueuse/core'
import { useFuse } from '@vueuse/integrations/useFuse'
import { useConn } from '@/stores/conn'
import { SQLQuery } from '@/lib/sql-queries'
import type { ExternalTransaction } from '@/types/transactions'

export function useTransactionSearch() {
  const searchQuery = ref('')
  const { query } = useConn()

  const allTransactions = ref<ExternalTransaction[]>([])

  watchOnce(searchQuery, async () => allTransactions.value = await query<ExternalTransaction[]>(SQLQuery.SelectAllTransactions))

  const { results: filteredTransactions } = useFuse(searchQuery, allTransactions, { fuseOptions: {
    keys: ['title', 'message', 'shopName', 'shopCategory', 'amount', 'message'],
    sortFn: ({ item: a }, { item: b }) => (b.timestamp as unknown as number) - (a.timestamp as unknown as number),
    distance: 100,
  } })

  return {
    searchQuery,
    filteredTransactions: computed(() => filteredTransactions.value.map(res => res.item)),
    allTransactions,
  }
}
