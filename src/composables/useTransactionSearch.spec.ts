import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { Asset, Chain } from '@/lib/assets'
import { Transfer } from '@/types/transactions'

describe('useTransactionSearch', () => {
  it('updates search results when the transaction source changes', async () => {
    const transactions = ref([{
      hash: '0x1',
      timestamp: 1,
      title: 'Payment to Alice',
      transfer: Transfer.UserPayment,
      amount: 123,
      asset: Asset.NIM,
      chain: Chain.Nimiq,
      sender: 'NQ00',
      senderType: 0,
      recipient: 'NQ01',
      recipientType: 0,
      fee: 0,
      status: 'confirmed',
      raw: '',
      message: '',
      rail: 'unknown',
      paymentRef: '',
      merchantName: '',
      merchantCategory: '',
      isCashbackClaimed: false,
    }] as any[])

    const { useTransactionSearch } = await import('./useTransactionSearch')
    const { searchQuery, filteredTransactions } = useTransactionSearch(transactions)

    searchQuery.value = 'Alice'
    await nextTick()

    expect(filteredTransactions.value).toHaveLength(1)
    expect(filteredTransactions.value[0].hash).toBe('0x1')

    transactions.value = [{
      ...transactions.value[0],
      hash: '0x2',
      title: 'Payment to Bob',
    }]
    await nextTick()

    await vi.waitFor(() => {
      expect(filteredTransactions.value).toHaveLength(0)
    })

    searchQuery.value = 'Bob'
    await nextTick()

    expect(filteredTransactions.value).toHaveLength(1)
    expect(filteredTransactions.value[0].hash).toBe('0x2')
  })
})
