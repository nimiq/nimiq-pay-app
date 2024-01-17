import { useScroll } from '@vueuse/core'
import { type MaybeRef, type Ref, computed, ref, toValue } from 'vue'

export interface UseCarouselOptions {
  columnGap?: number
  scrollBehavior?: ScrollBehavior
  activeIndex?: Ref<number>
}

export function useCarousel(scroller: MaybeRef<HTMLElement | undefined>, slideWidth: Ref<number | undefined>, options: UseCarouselOptions = {}) {
  const { columnGap = 0, scrollBehavior = 'smooth', activeIndex = ref(0) } = options
  const elRef = computed(() => toValue(scroller))
  const { isScrolling, x } = useScroll(elRef, { behavior: scrollBehavior })

  function goToSlide(index: number) {
    if (!elRef.value || !slideWidth.value) {
      console.warn('Cannot go to slide', index, { elRef: elRef.value, slideWidth: slideWidth.value })
      return
    }

    activeIndex.value = index

    // For some reason in Safari, the scrollLeft value is not updated immediately after the scroll event
    // so we need to wait a tick before scrolling
    window.requestAnimationFrame(() => x.value = (slideWidth.value! + (columnGap * 2)) * index)
  }

  return {
    activeIndex,
    goToSlide,
    isScrolling,
    nextSlide: () => goToSlide(activeIndex.value + 1),
    prevSlide: () => goToSlide(activeIndex.value - 1),
  }
}
