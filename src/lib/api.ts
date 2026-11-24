export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export async function api<T = void>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (response.status === 204) return undefined as T

  let payload: { error?: string }
  try {
    payload = await response.json() as { error?: string }
  } catch {
    throw new ApiError('The server returned an invalid response. Please try again.', response.status)
  }
  if (!response.ok) throw new ApiError(payload.error ?? 'Something went wrong. Please try again.', response.status)
  return payload as T
}
