<script setup lang="ts">
import { stepEmits } from '@/lib/flows/steps.types'
import { TransactionListState, useTransactions } from '@/stores/transactions'
import { storeToRefs } from 'pinia'
import QuickButton from './QuickButton.vue'
import TransactionItem from './TransactionItem.vue'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

defineEmits(stepEmits)

const { loadMoreTxs, canLoadMore } = useTransactions()
const { searchQuery, transactionsToShow: transactions, status } = storeToRefs(useTransactions())

const itemHeight = 42 /* Height */ + 24 /* padding-y */

// const wrapperEl = ref<HTMLOListElement>()
// const { isLoading } = useInfiniteScroll(wrapperEl, loadMoreTxs, { distance: itemHeight * 5, canLoadMore })
</script>

<template>
  <div class="flex flex-col w-full h-[calc(100vh-72px)]">
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

    <div class="sticky inset-x-0 h-10 pointer-events-none -top-0.5 bg-gradient-to-b from-white to-transparent via-white/80" />
    <RecycleScroller
      v-slot="{ item }"
      class="h-full pb-10"
      :items="transactions"
      :item-size="itemHeight"
      key-field="hash"
      @scroll-end="() => canLoadMore && loadMoreTxs()"
    >
      <TransactionItem :tx="item" @click="$emit('select', item)" />
    </RecycleScroller>

    <!-- <div v-if="isLoading" class="flex justify-center mt-4">
      {{ $t('Loading') }}
    </div> -->
  </div>
</template>
