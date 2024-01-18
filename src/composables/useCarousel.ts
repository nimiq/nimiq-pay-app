import { useScroll } from '@vueuse/core'
import { type MaybeRef, type Ref, computed, ref, toValue } from 'vue'

export interface UseCarouselOptions {
  columnGap?: number
  scrollBehavior?: ScrollBehavior
  activeIndex?: Ref<number>
}

export function useCarousel(scroller: MaybeRef<HTMLElement | undefined>, options: UseCarouselOptions = {}) {
  const { scrollBehavior = 'smooth', activeIndex = ref(0) } = options
  const elRef = computed(() => toValue(scroller))
  const { isScrolling } = useScroll(elRef, { behavior: scrollBehavior })

  function goToSlide(index: number) {
    if (!elRef.value) {
      console.warn('Cannot go to slide', index, { elRef: elRef.value })
      return
    }

    activeIndex.value = index

    // For some reason in Safari, the scrollLeft value is not updated immediately after the scroll event
    // so we need to wait a tick before scrolling
    const item = elRef.value?.children[index]
    window.requestAnimationFrame(() => item.scrollIntoView({ behavior: scrollBehavior, inline: 'center', block: 'nearest' }))
  }

  return {
    activeIndex,
    goToSlide,
    isScrolling,
    nextSlide: () => goToSlide(activeIndex.value + 1),
    prevSlide: () => goToSlide(activeIndex.value - 1),
  }
}
