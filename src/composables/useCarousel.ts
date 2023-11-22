import { type ConfigurableWindow, type MaybeRefOrGetter, defaultWindow, unrefElement } from '@vueuse/core'
import type { MaybeRef } from 'vue'
import { computed, ref, toValue } from 'vue'

export type UseCarouselOptions = ConfigurableWindow & {
  columnGap?: number
  scrollBehavior?: ScrollBehavior
}

export function useCarousel(scroller: MaybeRefOrGetter<HTMLElement | null | undefined>, slideWidth: MaybeRef<number>, options: UseCarouselOptions = {}) {
  const { window = defaultWindow, columnGap = 0, scrollBehavior = 'smooth' } = options
  const elRef = computed(() => unrefElement(scroller) || window?.document?.documentElement)
  const size = computed(() => elRef.value?.childElementCount || 0)
  const activeIndex = ref(0)

  // function calculateActiveIndex() {
  //   if (!elRef.value)
  //     return
  //   activeIndex.value = Math.round(elRef.value.scrollLeft / (toValue(slideWidth) + (columnGap * 2)))
  // }

  function goToSlide(index: number) {
    if (!elRef.value)
      return
    activeIndex.value = index
    elRef.value!.scrollTo({
      left: (toValue(slideWidth) + (columnGap * 2)) * index,
      behavior: scrollBehavior,
    })
  }

  // function removeSlide(index: number) {
  //   if (!elRef.value)
  //     return
  //   const slide = elRef.value.children[index]
  //   if (!slide)
  //     return
  //   slide.remove()
  //   goToSlide(Math.min(index, size.value - 1))
  // }

  return {
    activeIndex,
    goToSlide,
    nextSlide: () => goToSlide(activeIndex.value + 1),
    prevSlide: () => goToSlide(activeIndex.value - 1),
  }
}
