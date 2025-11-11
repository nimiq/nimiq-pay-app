import type { MaybeRef } from 'vue'
import type { Crypto, Fiat } from '@/stores/app'
import { FormattableNumber } from '@nimiq/utils'
import { storeToRefs } from 'pinia'
import { toValue } from 'vue'
import { useApp } from '@/stores/app'

export interface FormatFiatOptions {
  /**
   * If true, the number of decimals is 0
   * @default false
   */
  short?: boolean

  /**
   * The currency to use
   * @default selectedFiat.value
   */
  currency?: MaybeRef<Fiat | string>

  locale?: MaybeRef<string>

  /**
   * If true, a minus sign is prepended
   */
  isPayment?: boolean
}

export interface FormatCryptoOptions {
  /**
   * The currency to use
   * @default NIM
   */
  currency?: MaybeRef<Crypto>

  locale?: MaybeRef<string>
}

export function useCurrencyFormatter() {
  const { language, selectedFiat } = storeToRefs(useApp())

  const baseFormatterOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currencyDisplay: 'narrowSymbol',
  }

  function formatFiat(amount: number, options: FormatFiatOptions = {}): string {
    const currency = toValue(options.currency || selectedFiat)
    const locale = toValue(options.locale || language)
    const digitsOptions = options.short ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    const formatter = new Intl.NumberFormat(locale, { currency, ...baseFormatterOptions, ...digitsOptions })
    return `${options.isPayment ? '- ' : ''}${amount < 0.01 && amount > 0 ? '~' : ''}${formatter.format(amount)}`
  }

  function formatCrypto(amountInLuna: number, options?: FormatCryptoOptions): string {
    if (!amountInLuna)
      return '0 NIM'
    const currency = toValue(options?.currency)
    const amountInNim = amountInLuna / 1e5 // Convert to NIM
    return `${new FormattableNumber(amountInNim).toString({ maxDecimals: 2, useGrouping: true })}${currency ? ` ${currency}` : ''}`
  }

  return {
    formatFiat,
    formatCrypto,
  }
}
