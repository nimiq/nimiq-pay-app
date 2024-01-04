import { type MaybeRef, type Ref, computed, ref, toValue } from 'vue'

export interface UseCarouselOptions {
  columnGap?: number
  scrollBehavior?: ScrollBehavior
  activeIndex?: Ref<number>
}

export function useCarousel(scroller: MaybeRef<HTMLElement | undefined>, slideWidth: MaybeRef<number>, options: UseCarouselOptions = {}) {
  const { columnGap = 0, scrollBehavior = 'smooth', activeIndex = ref(0) } = options
  const elRef = computed(() => toValue(scroller))

  // function calculateActiveIndex() {
  //   if (!elRef.value)
  //     return
  //   activeIndex.value = Math.round(elRef.value.scrollLeft / (toValue(slideWidth) + (columnGap * 2)))
  // }

  function goToSlide(index: number) {
    if (!elRef.value)
      return

    activeIndex.value = index

    // For some reason in Safari, the scrollLeft value is not updated immediately after the scroll event
    // so we need to wait a tick before scrolling
    window.requestAnimationFrame(() => elRef.value!.scrollTo({
      left: (toValue(slideWidth) + (columnGap * 2)) * index,
      behavior: scrollBehavior,
    }))
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
