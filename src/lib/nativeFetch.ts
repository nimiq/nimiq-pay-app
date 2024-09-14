export async function nativeFetch(url: URL | RequestInfo, options?: RequestInit): Promise<Response> {
  const { CapacitorHttp: { request } } = await import('@capacitor/core')

  const headers = options?.headers
  if (headers && (Array.isArray(headers) || headers instanceof Headers))
    throw new Error('Headers must be a Record<string, string>')

  const response = await request({
    url: url.toString(),
    method: options?.method,
    headers,
    data: options?.body,
    // webFetchExtra: options,
  })
  if (response.status !== 200) {
    const { useLogger } = await import('@/composables/useLogger')
    useLogger('nativeFetch').error(`Failed to fetch ${url}: ${JSON.stringify({ request, response })}`)
  }

  return new Response(JSON.stringify(response.data), {
    headers: { 'Content-Type': 'application/json', ...response.headers },
    status: response.status,
  })
}
