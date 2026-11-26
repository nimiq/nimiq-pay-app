import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  create: vi.fn(async () => ({
    present: vi.fn(async () => {}),
    style: { setProperty: vi.fn() },
  })),
  getTop: vi.fn(async (): Promise<HTMLIonModalElement | undefined> => undefined),
  trackFeatureOpened: vi.fn(),
}))

vi.mock('@ionic/vue', () => ({
  modalController: {
    create: state.create,
    getTop: state.getTop,
  },
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    log: vi.fn(),
  }),
}))

vi.mock('@/lib/analytics', () => ({
  trackFeatureOpened: state.trackFeatureOpened,
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    activeAsset: 'NIM',
  }),
}))

describe('useModal analytics', () => {
  beforeEach(() => {
    state.create.mockClear()
    state.trackFeatureOpened.mockClear()
  })

  it('tracks feature_opened when analytics metadata is provided', async () => {
    const { Modal, useModal } = await import('./useModal')

    await useModal().showModal(Modal.MiniApps, {
      analytics: {
        featureName: 'mini_apps',
        source: 'menu',
      },
    })

    expect(state.trackFeatureOpened).toHaveBeenCalledWith({
      featureName: 'mini_apps',
      source: 'menu',
      channel: 'modal',
      activeAsset: 'NIM',
    })
  })

  it('does not track feature_opened for modals without analytics metadata', async () => {
    const { Modal, useModal } = await import('./useModal')

    await useModal().showModal(Modal.MiniApps)

    expect(state.trackFeatureOpened).not.toHaveBeenCalled()
  })
})

describe('useModal closeModal', () => {
  it('keeps a function canDismiss so dismiss() still runs the flow close hook', async () => {
    const { useModal } = await import('./useModal')
    const canDismiss = vi.fn(async () => true)
    const modal = { canDismiss, dismiss: vi.fn(async () => true) } as unknown as HTMLIonModalElement

    await useModal().closeModal({ modal, role: 'cancel' })

    expect(modal.canDismiss).toBe(canDismiss)
    expect(modal.dismiss).toHaveBeenCalledWith(null, 'cancel')
  })

  it('forces a boolean canDismiss guard to true before dismissing', async () => {
    const { useModal } = await import('./useModal')
    const modal = { canDismiss: false, dismiss: vi.fn(async () => true) } as unknown as HTMLIonModalElement

    await useModal().closeModal({ modal })

    expect(modal.canDismiss).toBe(true)
    expect(modal.dismiss).toHaveBeenCalledWith(null, 'confirm')
  })
})

describe('useModal showModal closing the top modal', () => {
  beforeEach(() => {
    state.getTop.mockReset()
  })

  it('keeps a non-dismissible top modal open and stacks the new modal', async () => {
    const { Modal, useModal } = await import('./useModal')
    const top = { canDismiss: false, dismiss: vi.fn(async () => true) } as unknown as HTMLIonModalElement
    state.getTop.mockResolvedValue(top)

    await useModal().showModal(Modal.LongTimeNoSee)

    expect(top.dismiss).not.toHaveBeenCalled()
    expect(top.canDismiss).toBe(false)
  })

  it('closes a dismissible top modal before showing the new modal', async () => {
    const { Modal, useModal } = await import('./useModal')
    const top = { canDismiss: true, dismiss: vi.fn(async () => true) } as unknown as HTMLIonModalElement
    state.getTop.mockResolvedValue(top)

    await useModal().showModal(Modal.LongTimeNoSee)

    expect(top.dismiss).toHaveBeenCalledWith(null, 'confirm')
  })
})
