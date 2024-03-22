import { type MaybeRef, toValue } from 'vue'
import { storeToRefs } from 'pinia'
import { useApp } from '@/stores/app'
import type { Crypto, Fiat } from '@/stores/app'

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

  const baseFormatterOptions = {
    style: 'currency',
    currencyDisplay: 'narrowSymbol',
  }

  function formatFiat(amount: number, options: FormatFiatOptions = {}) {
    const currency = toValue(options.currency || selectedFiat)
    const locale = toValue(options.locale || language)
    const digitsOptions = options.short ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    const formatter = new Intl.NumberFormat(locale, { currency, ...baseFormatterOptions, ...digitsOptions })
    return `${options.isPayment ? '- ' : ''}${formatter.format(amount)}`
  }

  function formatCrypto(amountInLuna: number, options?: FormatCryptoOptions) {
    if (!amountInLuna)
      return '0 NIM'
    const currency = toValue(options?.currency)
    const amountInNim = amountInLuna / 1e5 // Convert to NIM
    const locale = toValue(options?.locale || language)
    return `${amountInNim.toLocaleString(locale, { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`
  }

  return {
    formatFiat,
    formatCrypto,
  }
}
