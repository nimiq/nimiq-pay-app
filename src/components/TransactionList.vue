<script setup lang="ts">
import { useInfiniteScroll, useVirtualList } from '@vueuse/core'
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import TransactionItem from './TransactionItem.vue'
import QuickButton from './QuickButton.vue'
import { TransactionListState, useTransactions } from '@/stores/transactions'
import { stepEmits } from '@/lib/flows/steps.types'

defineEmits(stepEmits)

const { loadMoreTxs, canLoadMore } = useTransactions()
const { searchQuery, transactionsToShow: transactions, status } = storeToRefs(useTransactions())

const itemHeight = 37 /* Height */ + 24 /* padding-y */

const { list, containerProps, wrapperProps } = useVirtualList(transactions, { itemHeight })

const wrapperEl = ref<HTMLOListElement>()
const { isLoading } = useInfiniteScroll(wrapperEl, loadMoreTxs, { distance: itemHeight * 5, canLoadMore })
</script>

<template>
  <div class="flex flex-col w-full h-full">
    <h2 class="text-[13px] font-bold tracking-wider uppercase text-space/60">
      {{ $t('All transactions') }}
    </h2>

    <!-- TODO Lupa -->
    <input v-model="searchQuery" type="text" name="search" class="rounded-full ring-1 z-10 ring-[#cdcdd5] w-full outline-none mt-6 px-4 py-2 border-none text-space selection:bg-space selection:text-white" :placeholder="$t('Search')" @select.stop.prevent>

    <div v-if="status === TransactionListState.NoResults" class="pt-10">
      <i18n-t keypath="No transactions found for &quot;{searchQuery}&quot;" tag="p">
        <template #searchQuery>
          <span class="italic font-bold">{{ searchQuery }}</span>
        </template>
      </i18n-t>
      <QuickButton @click="searchQuery = ''">
        {{ $t('Reset search') }}
      </QuickButton>
    </div>

    <div
      v-else
      v-bind="containerProps"
      class="relative flex-1 pb-10" :style="{
        '--gap-right': '6px', // The gap between screen border and the scrollbar
        '--padding-right': '32px', // This is the default padding-x for the modal
        '--gap-content-and-scrollbar': 'calc(var(--padding-right) - var(--gap-right))',
        'margin-right': 'calc(var(--gap-content-and-scrollbar) * -1)',
        'padding-right': 'var(--gap-content-and-scrollbar)',
        'width': 'calc(100% + var(--gap-content-and-scrollbar))',
      }"
    >
      <div class="sticky inset-x-0 h-10 pointer-events-none -top-0.5 bg-gradient-to-b from-white to-transparent via-white/80" />
      <ol v-bind="wrapperProps" ref="wrapperEl">
        <li v-for="({ data: transaction }) in list" :key="transaction.hash" :data-hash="transaction.hash">
          <TransactionItem :tx="transaction" @click="$emit('select', transaction)" />
        </li>
      </ol>
    </div>

    <div v-if="isLoading" class="flex justify-center mt-4">
      {{ $t('Loading') }}
    </div>
  </div>
</template>
