export async function nativeFetch(url: URL | RequestInfo, options?: RequestInit): Promise<Response> {
  const { CapacitorHttp: { request } } = await import('@capacitor/core')

  const headers = options?.headers
  if (headers && (Array.isArray(headers) || headers instanceof Headers))
    throw new Error('Headers must be a Record<string, string>')

  const requestBody = options?.body
  const loggedBody = typeof requestBody === 'string' && requestBody.length > 1000
    ? `${requestBody.slice(0, 1000)}...`
    : requestBody
  const requestContext = {
    url: url.toString(),
    method: options?.method || 'GET',
    body: loggedBody,
  }
  let response
  try {
    response = await request({
      url: requestContext.url,
      method: options?.method,
      headers,
      data: requestBody,
      // webFetchExtra: options,
    })
  }
  catch (error) {
    const { useLogger } = await import('@/composables/useLogger')
    useLogger('nativeFetch').error('Native fetch request failed', error, requestContext)
    throw error
  }

  if (response.status !== 200) {
    const { useLogger } = await import('@/composables/useLogger')
    useLogger('nativeFetch').error('Native fetch returned non-200 response', {
      ...requestContext,
      status: response.status,
      responseHeaders: response.headers,
      responseBody: response.data,
    })
  }

  return new Response(JSON.stringify(response.data), {
    headers: { 'Content-Type': 'application/json', ...response.headers },
    status: response.status,
  })
}
