export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  idempotencyKey?: string;
  cookieHeader?: string;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, idempotencyKey, cookieHeader, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");
  if (idempotencyKey) requestHeaders.set("Idempotency-Key", idempotencyKey);
  if (cookieHeader) requestHeaders.set("cookie", cookieHeader);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: requestHeaders,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? "Beklenmeyen bir hata oluştu.",
      error?.details
    );
  }
  return payload as T;
}
