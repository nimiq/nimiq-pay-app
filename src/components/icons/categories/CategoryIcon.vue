<script setup lang="ts">
import CarsBikesIcon from '@/components/icons/categories/cars_bikes.vue'
import CashIcon from '@/components/icons/categories/cash.vue'
import ComputerElectronicsIcon from '@/components/icons/categories/computer_electronics.vue'
import DepositIcon from '@/components/icons/categories/deposit.vue'
import EntertainmentIcon from '@/components/icons/categories/entertainment.vue'
import FoodDrinksIcon from '@/components/icons/categories/food_drinks.vue'
import HealthBeautyIcon from '@/components/icons/categories/health_beauty.vue'
import HotelLodgingIcon from '@/components/icons/categories/hotel_lodging.vue'
import LeisureActivitiesIcon from '@/components/icons/categories/leisure_activities.vue'
import MiscellaneousIcon from '@/components/icons/categories/miscellaneous.vue'
import RestaurantBarIcon from '@/components/icons/categories/restaurant_bar.vue'
import ShopIcon from '@/components/icons/categories/shop.vue'
import SportsFitnessIcon from '@/components/icons/categories/sports_fitness.vue'
import WithdrawIcon from '@/components/icons/categories/withdraw.vue'
import { MerchantCategory } from '@/types/transactions'

defineProps({
  category: {
    type: String as () => MerchantCategory | 'deposit' | 'withdraw',
    default: MerchantCategory.Shop,
  },
})
</script>

<template>
  <div class="rounded-full aspect-square text-space bg-space/[0.06] w-8">
    <CarsBikesIcon v-if="category === MerchantCategory.CarsBikes" />
    <CashIcon v-else-if="category === MerchantCategory.Cash" />
    <ComputerElectronicsIcon v-else-if="category === MerchantCategory.ComputerElectronics" />
    <EntertainmentIcon v-else-if="category === MerchantCategory.Entertainment" />
    <FoodDrinksIcon v-else-if="category === MerchantCategory.FoodDrinks" />
    <HealthBeautyIcon v-else-if="category === MerchantCategory.HealthBeauty" />
    <HotelLodgingIcon v-else-if="category === MerchantCategory.HotelLodging" />
    <LeisureActivitiesIcon v-else-if="category === MerchantCategory.LeisureActivities" />
    <MiscellaneousIcon v-else-if="category === MerchantCategory.Miscellaneous" />
    <RestaurantBarIcon v-else-if="category === MerchantCategory.RestaurantBar" />
    <ShopIcon v-else-if="category === MerchantCategory.Shop" />
    <SportsFitnessIcon v-else-if="category === MerchantCategory.SportsFitness" />
    <DepositIcon v-else-if="category === 'deposit'" />
    <WithdrawIcon v-else-if="category === 'withdraw'" />
  </div>
</template>
