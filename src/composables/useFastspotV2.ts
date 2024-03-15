let fastspot: typeof import('@nimiq/fastspot-api-v2') | undefined

export async function useFastspotApiV2() {
  if (fastspot)
    return fastspot

  fastspot = await import('@nimiq/fastspot-api-v2')
  // TODO: Move these variables into env
  fastspot.init(
    'https://api.test.fastspot.io',
    '447f6050-25a5-453e-9b4f-a2db55abbbec',
  )
  return fastspot
}
