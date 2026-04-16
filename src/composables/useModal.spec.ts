import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  create: vi.fn(async () => ({
    present: vi.fn(async () => {}),
    style: { setProperty: vi.fn() },
  })),
  trackFeatureOpened: vi.fn(),
}))

vi.mock('@ionic/vue', () => ({
  modalController: {
    create: state.create,
    getTop: vi.fn(async () => undefined),
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
