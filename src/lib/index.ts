import { isTestnet } from '@/lib/network'

export const isDev = import.meta.env.DEV

export { isNetworkOverridden, isTestnet, type NetworkMode, networkOverride, setNetworkOverride } from '@/lib/network'

export const nimiqDomainUrl = isTestnet ? 'nimiq-testnet.com' : 'nimiq.com'

export const walletUrl = new URL(`https://wallet.${nimiqDomainUrl}`)

export const nimiqPayCosignerPublicKeys = isTestnet
  ? [
      'c1534c708122968212c6709526801d18218ce9303590f2bca473213d99b24aaf',
      '1a0fc4eb1376b604c7df66d098b29bbb2fcfd68ef328ce98ae0f7d19f4f6d456',
    ]
  : ['91b21f4b100273bd7034f6369c29d1f7ba72dba7de6720ad3cd8b81916218913']

export const debounceDelay = 1000
export const debounceMaxWait = 3000

// export const isBlueCodeEnabled = __ENABLE_BLUECODE__ && (useDevice().isIOS || isDev)
export const isMiniAppsEnabled = __ENABLE_MINI_APPS__
