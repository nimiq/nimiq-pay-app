<script setup lang="ts">
/**
 * Code originally from https://github.com/nimiq/vue3-componenets
 * Adapted because: we don't use 8px base font size, we don't have nimiq-styles, we want to use w-full on the button and IonButton
 */

import type { Component } from 'vue'
import { onLongPress, useTimeoutFn } from '@vueuse/core'
import { ref } from 'vue'

const { duration = 3000, component = 'button' } = defineProps<{ duration?: number, component?: Component | 'string' }>()

const emit = defineEmits<{ (e: 'longPress', event: PointerEvent): void }>()

const isPressed = ref(false)
const showPrompt = ref(false)
const componentRef = ref<HTMLElement>()

const { start: startPromptTimer, stop: stopPromptTimer } = useTimeoutFn(() => {
  if (isPressed.value) {
    showPrompt.value = true
  }
}, duration * 0.4, { immediate: false })

function handlePointerDown() {
  isPressed.value = true
  showPrompt.value = false
  startPromptTimer()
}

function handlePointerUp() {
  isPressed.value = false
  showPrompt.value = false
  stopPromptTimer()
}

onLongPress(componentRef, (e) => {
  emit('longPress', e)
  handlePointerUp()
}, { delay: duration, modifiers: { prevent: true } })
</script>

<template>
  <component
    :is="component"
    ref="componentRef"
    class="long-press-button nq-button"
    @pointerdown="handlePointerDown"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerUp"
    @blur="handlePointerUp"
    @mousedown.left.prevent="isPressed = true; /* also prevent focus. mouseup is registered on document */"
    @touchstart.prevent="isPressed = true; /* also prevent context menu on long press */"
    @keydown.enter.space.prevent="isPressed = true; /* also prevent triggering clicks */"
    @touchend="isPressed = false"
    @keyup.enter.space="isPressed = false"
    @click.prevent.stop="$event.stopImmediatePropagation(); /* don't trigger handlers */"
    @submit.prevent.stop="$event.stopImmediatePropagation(); /* don't trigger handlers and default behavior */"
  >
    <span class="mix-blend-mode-mask">
      <transition name="transition-indicator">
        <div v-if="isPressed" class="indicator" :style="`--transition-time: ${duration}ms`" />
      </transition>
      <!-- Both labels remain in the DOM to avoid layout changes -->
      <label :class="{ show: !showPrompt, center: isPressed && $slots.subline }">
        <slot />
      </label>
      <label :class="{ show: showPrompt, center: isPressed && $slots.subline }">
        {{ $t('Keep pressing…') }}
      </label>
      <span v-if="$slots.subline" class="subline" :class="{ show: !isPressed }">
        <slot name="subline" />
      </span>
    </span>
  </component>
</template>

<style scoped>
.long-press-button {
  --label-height: 0.875rem;
  --subline-height: 1.25rem;
  --transition-time: 3s;
  --release-transition-time: min(0.3s, var(--transition-time));

  contain: layout style;
  padding: 0;
}

.mix-blend-mode-mask {
  contain: layout paint style;
  display: flex;
  width: 100%;
  height: 100%;
  padding: 0 3.25rem;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  mix-blend-mode: lighten;
}

.indicator {
  contain: layout paint style;
  position: absolute;
  width: calc(100% - 0.75rem);
  max-height: calc(100% - 0.75rem);
  border-radius: 999px;
  overflow: hidden;
  background: white;
  mix-blend-mode: difference;
  transition: width var(--transition-time) ease-out;
}

.indicator.transition-indicator-enter-from,
.indicator.transition-indicator-leave-to {
  width: 0;
}

.indicator.transition-indicator-leave-active {
  transition-duration: var(--release-transition-time);
}

.indicator::after {
  contain: size layout paint style;
  content: '';
  display: block;
  padding-top: 100%;
}

label,
.subline {
  contain: style;
  white-space: nowrap;
  transition-property: color, margin;
  transition-timing-function: var(--nimiq-ease);
}

label:not(.show),
.subline:not(.show) {
  color: rgba(255, 255, 255, 0);
}

label {
  --center-offset: calc(var(--subline-height) / 2 - 1px);
  color: white;
  transition-duration: var(--release-transition-time);
}

label.center {
  transition-duration: 0.5s, 1s;
}

label:nth-of-type(1).center {
  margin-top: var(--center-offset);
}

label:nth-of-type(2) {
  --extra-margin: calc((var(--label-height) - 1.25rem) / 2);
  margin-top: calc(-1 * var(--label-height) + var(--extra-margin));
  margin-bottom: var(--extra-margin);
}

label:nth-of-type(2).center {
  margin-bottom: calc(-1 * var(--center-offset) + var(--extra-margin));
}

.subline {
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: normal;
  text-transform: none;
  color: rgba(255, 255, 255, 0.7);
  transition-duration: 1s;
}

.subline.show {
  transition-duration: var(--release-transition-time);
}
</style>
