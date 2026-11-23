import { Keyboard } from '@capacitor/keyboard'
import { useDevice } from '@/composables/useDevice'

export interface PinReceiver {
  id: symbol
  inputLength: number
  getValue: () => string
  setValue: (value: string) => void
  canAccept: () => boolean
}

let inputEl: HTMLInputElement | null = null
const receivers = new Set<symbol>()
let active: PinReceiver | null = null

function onInput() {
  if (!inputEl)
    return
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
  }
}

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
      window.requestAnimationFrame(() => {
        if (!active)
          closeKeyboard()
      })
    },
    focusActive() {
      applyActive()
    },
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
