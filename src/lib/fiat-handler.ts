import { computed, InjectionKey, Ref, ref } from "vue";
import { InstantPayWallet } from "./instant-pay-wallet";

export class FiatHandler {
    public readonly ready: Ref<boolean> = ref(false)
    public readonly digits: Ref<number> = ref(2)
    public readonly currency: Ref<String> = ref("EUR")
    public readonly price: Ref<number> = ref(0.00075)
    public readonly priceYesterday: Ref<number> = ref(0.0008)
    public readonly priceChange: Ref<number> = computed(() => this.price.value / this.priceYesterday.value - 1)

    static KEY: InjectionKey<FiatHandler> = Symbol(FiatHandler.name)
}