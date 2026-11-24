import type { MaybeRef, Ref } from 'vue'
import { useScroll } from '@vueuse/core'
import { computed, onMounted, ref, toValue } from 'vue'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('useCarousel')

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
    if (!elRef.value || index < 0 || index >= elRef.value.children.length) {
      logger.warn('Cannot go to slide', index, { elRef: elRef.value })
      return
    }

    activeIndex.value = index

    const item = elRef.value.children[index]
    window.requestAnimationFrame(() =>
      item.scrollIntoView({ behavior: scrollBehavior, inline: 'center', block: 'nearest' }),
    )
  }

  onMounted(async () => {
    if (elRef.value && activeIndex.value >= 0 && activeIndex.value < elRef.value.children.length) {
      const item = elRef.value.children[activeIndex.value]
      window.requestAnimationFrame(() =>
        item.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' }),
      )
      setTimeout(() => item.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' }), 50)
    }
  })

  return {
    activeIndex,
    goToSlide,
    isScrolling,
    nextSlide: () => goToSlide(activeIndex.value + 1),
    prevSlide: () => goToSlide(activeIndex.value - 1),
  }
}
