<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ text: string }>()
const host = ref<HTMLElement | null>(null)
const displayed = ref(props.text)
const ready = ref(false)

let ro: ResizeObserver | null = null
let raf = 0

// Shared hidden measurer
let measurer: HTMLSpanElement | null = null
function ensureMeasurer(font: string) {
  if (!measurer) {
    measurer = document.createElement('span')
    Object.assign(measurer.style, {
      position: 'absolute',
      visibility: 'hidden',
      whiteSpace: 'nowrap',
      top: '-9999px',
      left: '-9999px',
      pointerEvents: 'none',
    })
    document.body.appendChild(measurer)
  }
  measurer.style.font = font
}

function measureWidths(node: HTMLElement) {
  const cs = getComputedStyle(node)
  ensureMeasurer(cs.font)
  if (!measurer)
    return { ch: 7, ellipsis: 7, sep: 9 }

  measurer.textContent = '0'
  const ch = measurer.getBoundingClientRect().width || 7

  measurer.textContent = '…'
  const ellipsis = measurer.getBoundingClientRect().width || ch

  // thin space + ellipsis + thin space
  measurer.textContent = '\u2009…\u2009'
  const sep = measurer.getBoundingClientRect().width || (ellipsis + 2 * ch)

  return { ch, ellipsis, sep }
}

function compute() {
  const el = host.value
  if (!el)
    return

  const available = el.clientWidth
  if (!available)
    return

  const { ch, ellipsis, sep } = measureWidths(el)
  const text = props.text || ''

  const capacity = Math.floor(available / ch)

  // Fits fully
  if (capacity >= text.length) {
    if (displayed.value !== text)
      displayed.value = text
    ready.value = true
    return
  }

  // Too small for even plain ellipsis
  if (available <= ellipsis) {
    if (displayed.value !== '…')
      displayed.value = '…'
    ready.value = true
    return
  }

  const sepChars = Math.max(1, Math.ceil(sep / ch))
  const usable = capacity - sepChars

  // Not enough room for head/tail
  if (usable <= 0) {
    const minimal = available >= sep ? '\u2009…\u2009' : '…'
    if (displayed.value !== minimal)
      displayed.value = minimal
    ready.value = true
    return
  }

  const head = Math.ceil(usable / 2)
  const tail = Math.floor(usable / 2)
  const sepStr = '\u2009…\u2009'
  const next = `${text.slice(0, head)}${sepStr}${text.slice(-tail)}`

  if (displayed.value !== next)
    displayed.value = next
  ready.value = true
}

function schedule() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(compute)
}

onMounted(() => {
  schedule()
  ro = new ResizeObserver(schedule)
  if (host.value)
    ro.observe(host.value)
  window.addEventListener('resize', schedule, { passive: true })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  window.removeEventListener('resize', schedule)
})

watch(() => props.text, schedule)
</script>

<template>
  <!-- Keep invisible until first computed value is ready to avoid initial flash -->
  <span ref="host" class="block w-full max-w-full overflow-hidden whitespace-nowrap" :style="{ visibility: ready ? 'visible' : 'hidden' }">
    {{ displayed }}
  </span>
</template>
