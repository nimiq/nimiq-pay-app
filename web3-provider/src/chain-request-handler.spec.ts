import { describe, expect, it, vi } from 'vitest'
import { handleAddEthereumChain, handleSwitchEthereumChain } from './chain-request-handler'

function createDeps() {
  return {
    requestChainApproval: vi.fn(),
    isChainAvailable: vi.fn(),
    addDynamicChain: vi.fn(),
    setChainId: vi.fn(),
    setRpcUrl: vi.fn(),
    emitChainAdded: vi.fn(),
    emitChainChanged: vi.fn(),
    emitUnsupportedChain: vi.fn(),
    sendResponse: vi.fn(),
    sendError: vi.fn(),
  }
}

describe('chain request handler', () => {
  it('does not switch chain when the host rejects the request', async () => {
    const deps = createDeps()
    deps.isChainAvailable.mockReturnValue(true)
    deps.requestChainApproval.mockResolvedValue(false)

    await handleSwitchEthereumChain({
      id: 7,
      object: { chainId: '0x89' },
    }, deps)

    expect(deps.requestChainApproval).toHaveBeenCalledWith({
      action: 'switch',
      chainId: '0x89',
    })
    expect(deps.setChainId).not.toHaveBeenCalled()
    expect(deps.emitChainChanged).not.toHaveBeenCalled()
    expect(deps.sendResponse).not.toHaveBeenCalled()
    expect(deps.sendError).toHaveBeenCalledWith(7, {
      code: 4001,
      message: 'User rejected the request.',
    })
  })

  it('returns the standard user rejection message when adding a chain is rejected', async () => {
    const deps = createDeps()
    deps.isChainAvailable.mockReturnValue(false)
    deps.requestChainApproval.mockResolvedValue(false)

    await handleAddEthereumChain({
      id: 12,
      object: {
        chainId: '0x1234',
        chainName: 'Example Chain',
        rpcUrls: ['https://rpc.example'],
      },
    }, deps)

    expect(deps.addDynamicChain).not.toHaveBeenCalled()
    expect(deps.emitChainAdded).not.toHaveBeenCalled()
    expect(deps.setChainId).not.toHaveBeenCalled()
    expect(deps.sendResponse).not.toHaveBeenCalled()
    expect(deps.sendError).toHaveBeenCalledWith(12, {
      code: 4001,
      message: 'User rejected the request.',
    })
  })

  it('adds and switches chain only after host approval', async () => {
    const deps = createDeps()
    deps.isChainAvailable.mockReturnValue(false)
    deps.requestChainApproval.mockResolvedValue(true)

    await handleAddEthereumChain({
      id: 11,
      object: {
        chainId: '0x1234',
        chainName: 'Example Chain',
        rpcUrls: ['https://rpc.example'],
      },
    }, deps)

    expect(deps.requestChainApproval).toHaveBeenCalledWith({
      action: 'add',
      chainId: '0x1234',
      chainName: 'Example Chain',
      rpcUrl: 'https://rpc.example',
    })
    expect(deps.addDynamicChain).toHaveBeenCalledWith(0x1234)
    expect(deps.emitChainAdded).toHaveBeenCalledWith('0x1234', 'https://rpc.example')
    expect(deps.setChainId).toHaveBeenCalledWith('0x1234')
    expect(deps.setRpcUrl).toHaveBeenCalledWith('https://rpc.example')
    expect(deps.emitChainChanged).toHaveBeenCalledWith('0x1234')
    expect(deps.sendResponse).toHaveBeenCalledWith(11, null)
    expect(deps.sendError).not.toHaveBeenCalled()
  })
})
