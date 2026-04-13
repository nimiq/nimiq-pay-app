import type { ExternalTransaction } from '@/types/transactions'
import { computed, ref } from 'vue'
import { translateTransactionTitle } from '@/types/transactions'

export function useTransactionSearch(transactions: { value: ExternalTransaction[] }) {
  const searchQuery = ref('')

  const filteredTransactions = computed(() => {
    const query = searchQuery.value.trim()
    if (!query)
      return [] as ExternalTransaction[]

    const normalizedQuery = query.toLowerCase()

    return transactions.value
      .filter((tx) => {
        const searchableText = [
          translateTransactionTitle(tx.title),
          tx.title,
          tx.message,
          tx.merchantName,
          tx.merchantCategory,
          tx.amount,
          tx.asset,
          tx.chain,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return searchableText.includes(normalizedQuery)
      })
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
  })

  return {
    searchQuery,
    filteredTransactions,
    allTransactions: transactions,
  }
}
