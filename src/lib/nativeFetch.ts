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

  return Response.json(response.data, {
    headers: response.headers,
    status: response.status,
  })
}
