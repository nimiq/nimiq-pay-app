// A single hidden <input> shared by all PIN flow steps (APP-157).
//
// Each PIN step used to render its own hidden <input> inside its carousel slide. Between the "enter PIN" and
// "confirm PIN" steps, focus had to hand off from one input to the other while the carousel scrolled. On fast
// typing that handoff raced: keystrokes landed in the previous (off-screen) input, the browser scroll-snapped
// back to it, and the flow got stuck.
//
// Instead there is ONE input, rendered by Flow.vue only for flows that contain a PIN step (inside the flow
// modal, as a sibling of the slide carousel — never inside a scrolling slide, and never in the modal's inert
// background as a stray body/#app element would be, which is what stopped the numeric keyboard from appearing).
// It is never unmounted between steps, so focus never has to move — the active step is switched by re-pointing
// which receiver the element writes to. Only flow steps (which pass a stepName) use it; standalone PinInput
// usages (PinView, EnableBiometricModal) keep their own local <input>.
//
// Assumption: at most one PIN-bearing flow modal is live at a time. This state is module-level, so provideElement
// is last-writer-wins; stacking two PIN flows (via isOnTop) would cross-wire them.

import { Keyboard } from '@capacitor/keyboard'
import { useDevice } from '@/composables/useDevice'

export interface PinReceiver {
  id: symbol
  inputLength: number
  getValue: () => string
  setValue: (value: string) => void
  // Whether the receiver currently accepts input (false during the error wiggle / loading).
  canAccept: () => boolean
}

let inputEl: HTMLInputElement | null = null
const receivers = new Set<symbol>()
let active: PinReceiver | null = null

function onInput() {
  if (!inputEl)
    return
  // Drop input that arrives while no step is active (mid-navigation) or while the active step is busy.
  if (!active || !active.canAccept()) {
    inputEl.value = active ? active.getValue() : ''
    return
  }
  const value = inputEl.value.replace(/\D/g, '').slice(0, active.inputLength)
  inputEl.value = value
  active.setValue(value)
}

function onPaste(event: Event) {
  event.preventDefault()
}

// Mirror PinView's proven keyboard trigger: programmatic focus (opens the keyboard on iOS) plus an explicit
// Keyboard.show() on Android.
function openKeyboard() {
  if (!inputEl)
    return
  inputEl.focus()
  try {
    if (useDevice().isAndroid)
      Keyboard.show()
  }
  catch {
    // Keyboard plugin unavailable (web) — focus alone is enough.
  }
}

// Blur + dismiss the native keyboard. el.blur() alone does not close the native keyboard on iOS/Android, so
// Keyboard.hide() is required. Only hide when our input was the focused one, so we never dismiss the keyboard
// of a different step that took focus.
function closeKeyboard() {
  if (!inputEl)
    return
  const wasFocused = document.activeElement === inputEl
  inputEl.blur()
  if (!wasFocused)
    return
  try {
    Keyboard.hide()
  }
  catch {
    // Keyboard plugin unavailable (web) — blur is enough.
  }
}

// Point the shared element at the active receiver and open the keyboard for it. setActive runs once the step is
// the active one (after the modal-present animation), so focusing here reliably shows the keyboard. Skip if
// already focused (coming from another PIN step) to avoid a hide/show flicker.
function applyActive() {
  if (!inputEl || !active)
    return
  inputEl.maxLength = active.inputLength
  inputEl.value = active.getValue()
  if (document.activeElement !== inputEl)
    openKeyboard()
}

export function useSharedPinInput() {
  return {
    // Flow.vue hands over the single <input> element it renders inside the modal.
    provideElement(el: HTMLInputElement) {
      if (inputEl === el)
        return
      inputEl = el
      el.addEventListener('input', onInput)
      el.addEventListener('paste', onPaste)
      applyActive()
    },
    releaseElement(el: HTMLInputElement) {
      if (inputEl !== el)
        return
      el.removeEventListener('input', onInput)
      el.removeEventListener('paste', onPaste)
      inputEl = null
    },
    register(receiver: PinReceiver) {
      receivers.add(receiver.id)
    },
    unregister(receiver: PinReceiver) {
      receivers.delete(receiver.id)
      if (active?.id === receiver.id)
        active = null
      // Release the keyboard once no PIN step is mounted anymore (e.g. the flow closed).
      if (receivers.size === 0)
        closeKeyboard()
    },
    setActive(receiver: PinReceiver) {
      active = receiver
      applyActive()
    },
    clearActive(receiver: PinReceiver) {
      if (active?.id === receiver.id)
        active = null
      // Defer the blur one frame: navigating between the two PIN steps clears the old step and activates the
      // new one in the same tick, so if another step took over we must NOT blur (that would flicker the
      // keyboard). Only blur when no PIN step is active anymore — i.e. the balls are no longer visible.
      window.requestAnimationFrame(() => {
        if (!active)
          closeKeyboard()
      })
    },
    // Called by Flow when the active step becomes fully visible (IntersectionObserver) — the right moment to
    // open the keyboard. No-op for non-PIN steps (applyActive early-returns when there is no active receiver).
    focusActive() {
      applyActive()
    },
    // Push a programmatic value change (clear, biometric autofill, dot-click edit) back to the element.
    syncValue(receiver: PinReceiver) {
      if (active?.id === receiver.id && inputEl)
        inputEl.value = receiver.getValue()
    },
    // Called from a user tap on the dots. If the element is already focused (e.g. it was focused
    // programmatically on mount but the keyboard never opened without a gesture), blur first so this
    // in-gesture focus reliably re-opens the keyboard.
    focus() {
      if (!inputEl)
        return
      if (document.activeElement === inputEl)
        inputEl.blur()
      openKeyboard()
    },
  }
}
