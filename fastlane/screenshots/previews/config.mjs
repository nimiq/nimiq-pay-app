export const concepts = [
  { id: 'nim', title: 'Pay with NIM', titleLines: ['Pay with', 'NIM'], slug: '0-pay-with-nim', ios: '0HomeScreen', android: '0HomeScreen' },
  { id: 'usdt', title: 'Pay with USDT', titleLines: ['Pay with', 'USDT'], slug: '1-pay-with-usdt', ios: '1HomeUSDT', android: '2HomeUSDT' },
  { id: 'top-up', title: 'Fund and withdraw anytime', titleLines: ['Fund and withdraw', 'anytime'], slug: '2-fund-and-withdraw', ios: '2TopUp', android: '1TopUp' },
  { id: 'mini-apps', title: 'Discover Mini Apps', titleLines: ['Discover', 'Mini Apps'], slug: '3-discover-mini-apps', ios: '3MiniApps', android: '3MiniApps' },
]

export const formats = [
  {
    id: 'ios-67',
    label: 'App Store iPhone 1242 x 2688',
    width: 1242,
    height: 2688,
    sourceKind: 'ios',
    sourcePrefix: 'fastlane/screenshots/en-US/iPhone 15 Pro Max-',
    sourceAspect: 1290 / 2796,
    deviceWidth: 0.76,
  },
  {
    id: 'ios-65',
    label: 'App Store iPhone 1284 x 2778',
    width: 1284,
    height: 2778,
    sourceKind: 'ios',
    sourcePrefix: 'fastlane/screenshots/en-US/iPhone 12 Pro Max-',
    sourceAspect: 1284 / 2778,
    deviceWidth: 0.76,
  },
  {
    id: 'ios-55',
    label: 'App Store iPhone 1242 x 2688 (alternate)',
    width: 1242,
    height: 2688,
    sourceKind: 'ios',
    sourcePrefix: 'fastlane/screenshots/en-US/iPhone 12 Pro Max-',
    sourceAspect: 1284 / 2778,
    deviceWidth: 0.7,
  },
  {
    id: 'ipad-11',
    label: 'App Store iPad 11-inch',
    width: 1668,
    height: 2420,
    sourceKind: 'ios',
    sourcePrefix: 'fastlane/screenshots/en-US/iPhone 12 Pro Max-',
    sourceAspect: 1284 / 2778,
    deviceWidth: 0.5,
  },
  {
    id: 'android',
    label: 'Google Play',
    width: 1080,
    height: 1920,
    sourceKind: 'android',
    sourcePrefix: 'fastlane/screenshots/android/en-US/Phone-',
    sourceAspect: 1344 / 2992,
    deviceWidth: 0.62,
    imageFit: 'contain',
  },
]

export function getPreview(formatId, conceptId) {
  const format = formats.find(({ id }) => id === formatId)
  const concept = concepts.find(({ id }) => id === conceptId)
  if (!format || !concept)
    throw new Error(`Unknown preview: ${formatId}/${conceptId}`)

  return {
    ...format,
    conceptId: concept.id,
    title: concept.title,
    titleLines: concept.titleLines,
    slug: concept.slug,
    source: `${format.sourcePrefix}${concept[format.sourceKind]}.png`,
  }
}

export function getExportRelativePath(formatId, conceptId) {
  const preview = getPreview(formatId, conceptId)
  return `${preview.id}/${preview.slug}.png`
}
