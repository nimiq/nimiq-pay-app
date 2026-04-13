import { AbiCoder, getAddress, keccak256, toBeHex, toUtf8Bytes, zeroPadValue } from 'ethers'

const TOKEN_META_TX_VERSION = '1'
const EIP712_DOMAIN_TYPEHASH = keccak256(
  toUtf8Bytes('EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)'),
)

export interface TokenMetaTxDomain {
  name: string
  version: string
  verifyingContract: string
  salt: string
}

interface TokenMetaTxDomainInput {
  tokenName: string
  verifyingContract: string
  networkId: number
}

interface TokenMetaTxContract {
  name?: () => Promise<string>
  DOMAIN_SEPARATOR?: () => Promise<string>
}

export function buildTokenMetaTxDomain({
  tokenName,
  verifyingContract,
  networkId,
}: TokenMetaTxDomainInput): TokenMetaTxDomain {
  return {
    name: tokenName,
    version: TOKEN_META_TX_VERSION,
    verifyingContract: getAddress(verifyingContract),
    salt: zeroPadValue(toBeHex(networkId), 32),
  }
}

export function getTokenMetaTxDomainSeparator(domain: TokenMetaTxDomain): string {
  const abi = AbiCoder.defaultAbiCoder()

  return keccak256(abi.encode(
    ['bytes32', 'bytes32', 'bytes32', 'address', 'bytes32'],
    [
      EIP712_DOMAIN_TYPEHASH,
      keccak256(toUtf8Bytes(domain.name)),
      keccak256(toUtf8Bytes(domain.version)),
      getAddress(domain.verifyingContract),
      domain.salt,
    ],
  ))
}

export async function resolveTokenMetaTxDomain(
  contract: TokenMetaTxContract,
  { networkId, verifyingContract }: Omit<TokenMetaTxDomainInput, 'tokenName'>,
): Promise<TokenMetaTxDomain> {
  if (typeof contract.name !== 'function')
    throw new Error(`Token contract at ${verifyingContract} does not expose name() for meta-transaction signing`)

  const tokenName = await contract.name()
  const domain = buildTokenMetaTxDomain({
    tokenName,
    networkId,
    verifyingContract,
  })

  if (typeof contract.DOMAIN_SEPARATOR === 'function') {
    const onChainSeparator = await contract.DOMAIN_SEPARATOR()
    const localSeparator = getTokenMetaTxDomainSeparator(domain)

    if (onChainSeparator.toLowerCase() !== localSeparator.toLowerCase()) {
      throw new Error(
        `Token meta-transaction domain mismatch for ${verifyingContract}: `
        + `on-chain=${onChainSeparator} local=${localSeparator} tokenName=${tokenName}`,
      )
    }
  }

  return domain
}
