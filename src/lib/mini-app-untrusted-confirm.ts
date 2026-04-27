import type { MiniAppWarningDismissPayload } from '@/modals/MiniAppWarningModal.vue'
import { Modal, useModal } from '@/composables/useModal'

/**
 * Show the anti-scam warning for a mini-app URL the user has never opened before.
 * `rawUrl` is the pre-normalization input — preserved so the modal can analyze
 * homograph / zero-width / bidi payloads that WHATWG URL parsing would strip.
 * Resolves `true` only if the user taps "Open anyway".
 */
export async function confirmUntrustedMiniApp(opts: { normalizedUrl: string, rawUrl: string }): Promise<boolean> {
  const modal = await useModal().showModal(Modal.MiniAppWarning, {
    componentProps: { url: opts.normalizedUrl, rawUrl: opts.rawUrl },
    isOnTop: true,
    isSmall: true,
  })
  if (!modal)
    return false
  const { data, role } = await modal.onDidDismiss<MiniAppWarningDismissPayload>()
  return role === 'confirm' && data?.confirmed === true
}
