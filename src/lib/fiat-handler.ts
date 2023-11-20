import type { InjectionKey, Ref } from 'vue'
import { computed, ref } from 'vue'
import type { StorageKey, StorageManager } from './storage-manager'

interface FiatSettingStorage {
  currency?: string
  price?: number
  priceChange?: number
}

const FiatSettingStorage = { name: 'fiat' } as StorageKey<FiatSettingStorage>

export class FiatHandler {
  public readonly ready: Ref<boolean> = ref(false)
  public readonly digits: Ref<number> = ref(2)
  public readonly currency: Ref<string> = ref('USD')
  public readonly currencyPrefix: Ref<string> = computed(() => this.prefixFor(this.currency.value))
  public readonly currencySuffix: Ref<string> = computed(() => this.suffixFor(this.currency.value))
  public readonly price: Ref<number> = ref(0.001)
  public readonly priceChange: Ref<number> = ref(0)
  public readonly currencies: string[] = ['USD', 'EUR', 'CRC']

  constructor(private storageManager: StorageManager) {
    (async () => {
      const storage = await this.storageManager.get(FiatSettingStorage)
      if (storage.currency !== undefined)
        this.currency.value = storage.currency

      else
        await this.storageManager.update(FiatSettingStorage, storage => storage.currency = this.currency.value)

      if (storage.price !== undefined)
        this.price.value = storage.price

      if (storage.priceChange !== undefined)
        this.priceChange.value = storage.priceChange

      await this.updatePrice()
    })()
  }

  private async nimPriceAt(ts: number): Promise<number> {
    const rounded = Math.floor(ts / 600000) * 600
    const query = await this.storageManager.query('SELECT value FROM price WHERE ts = ?', [rounded])
    if (query.length === 0 || query[0].value === undefined) {
      const res = await fetch(`https://prices.nim.sh/prices/nim/time/${rounded}`)
      const price = (await res.json()).price
      await this.storageManager.run('INSERT OR REPLACE INTO price(ts, value) VALUES (?, ?)', [rounded, price])
      return price
    }
    else {
      return query[0].value
    }
  }

  private async nimPriceNow(): Promise<number> {
    const ts = Date.now()
    const rounded = Math.floor(ts / 600000) * 600
    const query = await this.storageManager.query('SELECT value FROM price WHERE ts = ?', [rounded])
    if (query.length === 0 || query[0].value === undefined) {
      const res = await fetch('https://prices.nim.sh/prices/nim/now')
      return (await res.json()).price
    }
    else {
      return query[0].value
    }
  }

  private async fiatPriceAt(ts: number, currency: string): Promise<number> {
    if (currency === 'USD')
      return 1
    const rounded = Math.floor(ts / 86400000) * 86400
    const query = await this.storageManager.query('SELECT value FROM fiat WHERE ts = ? AND currency = ?', [rounded, currency])
    if (query.length === 0 || query[0].value === undefined) {
      const res = await fetch(`https://prices.nim.sh/prices/${currency}/time/${rounded}`)
      const price = (await res.json()).price
      await this.storageManager.run('INSERT OR REPLACE INTO price(ts, value) VALUES (?, ?)', [rounded, price])
      return price
    }
    else {
      return query[0].value
    }
  }

  private async fiatPriceNow(currency: string): Promise<number> {
    if (currency === 'USD')
      return 1
    return this.fiatPriceAt(Date.now(), currency)
  }

  private async updatePrice() {
    const currency = this.currency.value
    this.price.value = await this.nimPriceNow() * await this.fiatPriceNow(currency)
    const yesterday = Date.now() - 60 * 60 * 24 * 1000
    const yesterdayPrice = await this.nimPriceAt(yesterday) * await this.fiatPriceAt(yesterday, currency)
    this.priceChange.value = this.price.value / yesterdayPrice - 1
    await this.storageManager.update(FiatSettingStorage, (storage) => {
      storage.price = this.price.value
      storage.priceChange = this.priceChange.value
    })
  }

  async priceAtTime(ts: number) {
    const currency = this.currency.value
    let nimPrice = await this.nimPriceAt(ts)
    if (currency !== 'USD')
      nimPrice *= await this.fiatPriceAt(ts, currency)

    return nimPrice
  }

  prefixFor(currency: string): string {
    switch (this.currency.value) {
      case 'USD': return '$'
      case 'CRC': return '₡'
    }
    return ''
  }

  suffixFor(currency: string): string {
    switch (this.currency.value) {
      case 'EUR': return ' €'
    }
    return ''
  }

  async setCurrency(currency: string) {
    this.currency.value = currency
    await this.storageManager.update(FiatSettingStorage, (storage) => {
      storage.currency = currency
      storage.price = undefined
    })
    await this.updatePrice()
  }

  static KEY: InjectionKey<FiatHandler> = Symbol(FiatHandler.name)
}
