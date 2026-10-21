import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MockToast {
  message: string
  present: ReturnType<typeof vi.fn>
  dismiss: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  onDidDismiss: () => Promise<void>
}

const state = vi.hoisted(() => ({
  // Pending create() calls, resolved manually to control the interleaving
  creates: [] as Array<{ resolve: () => void, toast: MockToast }>,
}))

vi.mock('@ionic/vue', () => ({
  toastController: {
    create: vi.fn(({ message }: { message: string }) => {
      let dismissed!: () => void
      const didDismiss = new Promise<void>(resolve => dismissed = resolve)
      // A real element, like Ionic returns: Vue refs don't proxy DOM nodes, so identity checks hold
      const toast: MockToast = Object.assign(document.createElement('ion-toast'), {
        message,
        present: vi.fn(async () => {}),
        dismiss: vi.fn(async () => dismissed()),
        remove: vi.fn(),
        onDidDismiss: () => didDismiss,
      })
      return new Promise<MockToast>(resolve => state.creates.push({ resolve: () => resolve(toast), toast }))
    }),
  },
}))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: vi.fn() },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}))
vi.mock('@/components/icons', () => ({ toastError: '', toastSpinner: '', toastSuccess: '', toastWarning: '' }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), error: vi.fn() }) }))

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('useToast', () => {
  beforeEach(() => {
    state.creates.length = 0
    vi.resetModules()
  })

  it('does not orphan a keepOpen spinner whose create() resolves after a newer toast', async () => {
    const { useToast } = await import('./useToast')
    const { setToast, toast } = useToast()

    setToast({ message: 'Activating scanner', type: 'spinner', keepOpen: true })
    await flush()
    setToast({ message: 'No permission to use the camera', type: 'error' })
    await flush()
    const [spinner, error] = state.creates

    error.resolve()
    await flush()
    spinner.resolve()
    await flush()

    expect(toast.value?.message).toBe('No permission to use the camera')
    expect(spinner.toast.present).not.toHaveBeenCalled()
    expect(spinner.toast.remove).toHaveBeenCalled()
  })

  it('drops a pending toast when clearToast() runs before its create() resolves', async () => {
    const { useToast } = await import('./useToast')
    const { setToast, clearToast, toast } = useToast()

    setToast({ message: 'Activating scanner', type: 'spinner', keepOpen: true })
    await flush()
    await clearToast()
    state.creates[0].resolve()
    await flush()

    expect(toast.value).toBeNull()
    expect(state.creates[0].toast.present).not.toHaveBeenCalled()
  })

  it('clearToast(message) leaves a toast that replaced that message', async () => {
    const { useToast } = await import('./useToast')
    const { setToast, clearToast, toast } = useToast()

    setToast({ message: 'Activating scanner', type: 'spinner', keepOpen: true })
    await flush()
    state.creates[0].resolve()
    await flush()
    setToast({ message: 'No permission to use the camera', type: 'error' })
    await clearToast('Activating scanner')
    await flush()
    state.creates[1].resolve()
    await flush()
    await clearToast('Activating scanner')

    expect(state.creates[0].toast.dismiss).toHaveBeenCalled()
    expect(toast.value?.message).toBe('No permission to use the camera')
    expect(state.creates[1].toast.dismiss).not.toHaveBeenCalled()
  })

  it('clearToast(message) dismisses the toast while it is still shown', async () => {
    const { useToast } = await import('./useToast')
    const { setToast, clearToast, toast } = useToast()

    setToast({ message: 'Activating scanner', type: 'spinner', keepOpen: true })
    await flush()
    state.creates[0].resolve()
    await flush()
    await clearToast('Activating scanner')
    await flush()

    expect(state.creates[0].toast.dismiss).toHaveBeenCalled()
    expect(toast.value).toBeNull()
  })

  it('still dedupes a repeated message while the first call is pending', async () => {
    const { useToast } = await import('./useToast')
    const { setToast } = useToast()

    setToast({ message: 'Copied' })
    setToast({ message: 'Copied' })
    await flush()

    expect(state.creates).toHaveLength(1)
  })
})
