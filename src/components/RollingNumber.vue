<script setup lang="ts">
import { CurrencyInfo } from '@nimiq/utils'
import { motion } from 'motion-v'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  value: number
  currency: string
  animate?: boolean
}>(), {
  animate: true,
})

const GROUP_SEPARATOR = ' ' // narrow no-break space, matches FiatAmount/FormattableNumber

// Match FiatAmount's currency→locale derivation so symbol placement and grouping don't change.
function localeFor(currency: string): string {
  switch (currency.toLowerCase()) {
    case 'eur':
    case 'chf': return 'de'
    case 'gbp':
    case 'usd': return 'en'
    case 'cny': return 'zh'
    default: return currency.slice(0, 2).toLowerCase()
  }
}

type Cell
  = | { key: string, digit: number, order: number }
    | { key: string, char: string }

const cells = computed<Cell[]>(() => {
  const value = Number.isFinite(props.value) ? Math.max(0, props.value) : 0
  const decimals = new CurrencyInfo(props.currency).decimals
  const parts = new Intl.NumberFormat(localeFor(props.currency), {
    style: 'currency',
    currency: props.currency,
    currencyDisplay: 'narrowSymbol',
    numberingSystem: 'latn',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: 'min2', // groups only at 5+ integer digits, same threshold as FiatAmount
  }).formatToParts(value)

  const out: Cell[] = []
  const intCount = parts.reduce((n, p) => p.type === 'integer' ? n + p.value.length : n, 0)
  let seenInt = 0
  let fracIdx = 0
  let order = 0
  for (const part of parts) {
    if (part.type === 'integer') {
      for (const ch of part.value) {
        // place-value key so a new leading digit (999→1000) mounts cleanly and lower digits keep identity
        const power = intCount - 1 - seenInt++
        out.push({ key: `i${power}`, digit: Number(ch), order: order++ })
      }
    }
    else if (part.type === 'fraction') {
      for (const ch of part.value)
        out.push({ key: `f${fracIdx++}`, digit: Number(ch), order: order++ })
    }
    else if (part.type === 'group') {
      out.push({ key: `g${out.length}`, char: GROUP_SEPARATOR })
    }
    else if (part.type === 'decimal') {
      out.push({ key: `d${out.length}`, char: '.' }) // normalize to dot like FiatAmount
    }
    else {
      out.push({ key: `s${out.length}`, char: part.value }) // currency / literal / minusSign
    }
  }
  return out
})

const plain = computed(() => cells.value.map(c => 'char' in c ? c.char : String(c.digit)).join(''))
</script>

<template>
  <span class="rolling">
    <template v-if="animate">
      <span v-for="cell in cells" :key="cell.key" class="cell">
        <span v-if="'digit' in cell" class="window">
          <motion.span
            class="strip"
            :initial="{ y: '0%' }"
            :animate="{ y: `${-cell.digit * 10}%` }"
            :transition="{ type: 'spring', stiffness: 200, damping: 26, delay: cell.order * 0.03 }"
          >
            <span v-for="n in 10" :key="n" class="digit">{{ n - 1 }}</span>
          </motion.span>
        </span>
        <span v-else class="static">{{ cell.char }}</span>
      </span>
    </template>
    <template v-else>{{ plain }}</template>
  </span>
</template>

<style scoped>
.rolling {
  display: inline-flex;
  align-items: flex-end;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.cell {
  height: 1em;
  line-height: 1;
}

.window {
  display: block;
  height: 1em;
  overflow: hidden;
}

.strip {
  display: flex;
  flex-direction: column;
}

.digit {
  height: 1em;
  line-height: 1;
  text-align: center;
}

.static {
  display: block;
}
</style>
