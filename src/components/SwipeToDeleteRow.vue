<script setup lang="ts">
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from 'motion-v'
import { ref } from 'vue'

interface Props {
  disabled?: boolean
  deleteLabel?: string
  deleteTestid?: string
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  deleteLabel: 'Delete',
})
const emit = defineEmits<{
  (e: 'delete'): void
  (e: 'launch'): void
}>()

// Drag tuning. MAX = elastic floor, ARM = haptic-armed point, COMMIT = release-to-delete.
const MAX_SWIPE = 132
const ARM_AT = 80
const COMMIT_AT = 96
// Below this absolute drag, treat the gesture as a tap.
const TAP_TOLERANCE = 4

const reducedMotion = useReducedMotion()

const x = useMotionValue(0)
const opacity = useMotionValue(1)
const scaleY = useMotionValue(1)
const exiting = ref(false)
const armed = ref(false)
let dragMoved = false

// Curtain comes alive only after the row has actually moved a few px so a tap
// never tints red.
const curtainOpacity = useTransform(x, [-MAX_SWIPE, -10, 0], [1, 0.05, 0])
// Trash icon: small + faded + tilted at rest, full size + opaque + upright at MAX.
const trashOpacity = useTransform(x, [-MAX_SWIPE, -32, 0], [1, 0.2, 0])
const trashScale = useTransform(x, [-MAX_SWIPE, 0], [1.18, 0.55])
const trashRotate = useTransform(x, [-MAX_SWIPE, 0], [0, -18])

useMotionValueEvent(x, 'change', (latest) => {
  const isArmed = latest <= -ARM_AT
  if (isArmed === armed.value)
    return
  armed.value = isArmed
  if (isArmed)
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
})

function onDragStart() {
  dragMoved = false
}

function onDrag(_event: PointerEvent, info: { offset: { x: number } }) {
  if (Math.abs(info.offset.x) > TAP_TOLERANCE)
    dragMoved = true
}

async function onDragEnd() {
  if (x.get() <= -COMMIT_AT) {
    await commitDelete()
    return
  }
  // Snap back. Mass tuned so the row doesn't feel sluggish on quick flicks.
  animate(x, 0, { type: 'spring', stiffness: 460, damping: 38, mass: 0.55 })
  armed.value = false
}

async function commitDelete() {
  if (exiting.value)
    return
  exiting.value = true
  Haptics.notification({ type: NotificationType.Success }).catch(() => {})
  const fast = reducedMotion.value
  await Promise.all([
    animate(x, -360, { duration: fast ? 0.12 : 0.26, ease: [0.16, 1, 0.3, 1] }),
    animate(opacity, 0, { duration: fast ? 0.12 : 0.2, ease: 'linear' }),
  ])
  // Collapse the row's vertical footprint via transform so the rows below take
  // its place without animating layout properties.
  await animate(scaleY, 0, { duration: fast ? 0.08 : 0.16, ease: [0.16, 1, 0.3, 1] })
  emit('delete')
}

function onRowClick() {
  if (props.disabled || exiting.value)
    return
  // Suppress the click that fires after a real drag (motion-v passes it through
  // for taps; we treat any meaningful displacement as a drag).
  if (dragMoved || Math.abs(x.get()) > TAP_TOLERANCE) {
    dragMoved = false
    return
  }
  emit('launch')
}
</script>

<template>
  <motion.div
    class="swipe-row relative overflow-hidden rounded-md origin-top"
    :style="{ opacity, scaleY }"
  >
    <motion.div
      class="absolute inset-0 flex items-center justify-end pr-6 bg-cherry"
      :style="{ opacity: curtainOpacity }"
    >
      <button
        type="button"
        :aria-label="deleteLabel"
        :data-testid="deleteTestid"
        class="trash-button text-white p-2 -m-2 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        @click.stop="commitDelete"
      >
        <motion.div
          :style="{
            opacity: trashOpacity,
            scale: trashScale,
            rotate: trashRotate,
          }"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="w-7 h-7"
            aria-hidden="true"
          >
            <path d="M4 7h16" />
            <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </motion.div>
      </button>
    </motion.div>

    <motion.div
      class="relative bg-white"
      :style="{ x }"
      :drag="disabled || exiting ? false : 'x'"
      :drag-constraints="{ left: -MAX_SWIPE, right: 0 }"
      :drag-elastic="0.06"
      :drag-momentum="false"
      :drag-direction-lock="true"
      @drag-start="onDragStart"
      @drag="onDrag"
      @drag-end="onDragEnd"
      @click="onRowClick"
    >
      <slot />
    </motion.div>
  </motion.div>
</template>

<style scoped>
.swipe-row {
  /* Allow vertical scroll while we own horizontal swipe. */
  touch-action: pan-y;
}
</style>
