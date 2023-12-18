<script setup lang="ts">
import { ShopCategory } from '@/types/transactions'
import CarsBikesIcon from '@/components/icons/categories/cars_bikes.vue'
import CashIcon from '@/components/icons/categories/cash.vue'
import ComputerElectronicsIcon from '@/components/icons/categories/computer_electronics.vue'
import EntertainmentIcon from '@/components/icons/categories/entertainment.vue'
import FoodDrinksIcon from '@/components/icons/categories/food_drinks.vue'
import HealthBeautyIcon from '@/components/icons/categories/health_beauty.vue'
import HotelLodgingIcon from '@/components/icons/categories/hotel_lodging.vue'
import LeisureActivitiesIcon from '@/components/icons/categories/leisure_activities.vue'
import MiscellaneousIcon from '@/components/icons/categories/miscellaneous.vue'
import RestaurantBarIcon from '@/components/icons/categories/restaurant_bar.vue'
import ShopIcon from '@/components/icons/categories/shop.vue'
import SportsFitnessIcon from '@/components/icons/categories/sports_fitness.vue'

defineProps({
  category: {
    type: String as () => ShopCategory,
    default: ShopCategory.Shop,
  },
})
</script>

<template>
  <div class="rounded-full aspect-square text-space bg-space/[0.06] w-8">
    <CarsBikesIcon v-if="category === ShopCategory.CarsBikes" />
    <CashIcon v-else-if="category === ShopCategory.Cash" />
    <ComputerElectronicsIcon v-else-if="category === ShopCategory.ComputerElectronics" />
    <EntertainmentIcon v-else-if="category === ShopCategory.Entertainment" />
    <FoodDrinksIcon v-else-if="category === ShopCategory.FoodDrinks" />
    <HealthBeautyIcon v-else-if="category === ShopCategory.HealthBeauty" />
    <HotelLodgingIcon v-else-if="category === ShopCategory.HotelLodging" />
    <LeisureActivitiesIcon v-else-if="category === ShopCategory.LeisureActivities" />
    <MiscellaneousIcon v-else-if="category === ShopCategory.Miscellaneous" />
    <RestaurantBarIcon v-else-if="category === ShopCategory.RestaurantBar" />
    <ShopIcon v-else-if="category === ShopCategory.Shop" />
    <SportsFitnessIcon v-else-if="category === ShopCategory.SportsFitness" />
  </div>
</template>
