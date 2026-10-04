export interface ApiRequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Record<string, string>
}

export async function apiGet<T>(
  url: string,
  signal?: AbortSignal,
  options?: ApiRequestOptions,
): Promise<T> {
  const timeout = options?.timeoutMs ?? 12_000
  const fetchSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...options?.headers,
    },
    signal: fetchSignal,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message =
      typeof body?.detail === 'string'
        ? body.detail
        : `Layanan tidak tersedia (HTTP ${response.status}).`
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

export async function apiPost<T, D = unknown>(
  url: string,
  data?: D,
  signal?: AbortSignal,
  options?: ApiRequestOptions,
): Promise<T> {
  const timeout = options?.timeoutMs ?? 12_000
  const fetchSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options?.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: fetchSignal,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message =
      typeof body?.detail === 'string'
        ? body.detail
        : `Layanan tidak tersedia (HTTP ${response.status}).`
    throw new Error(message)
  }

  return response.json() as Promise<T>
}
