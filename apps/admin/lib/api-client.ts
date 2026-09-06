import type { authResponseSchema, userContextSchema } from "@restaurant-os/contracts";
import type { z } from "zod";

export type UserContext = z.infer<typeof userContextSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;

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
  accessToken?: string | null;
  body?: unknown;
  idempotencyKey?: string;
  cookieHeader?: string;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { accessToken, body, idempotencyKey, cookieHeader, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");
  if (accessToken) requestHeaders.set("Authorization", `Bearer ${accessToken}`);
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

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/v1/auth/login", { method: "POST", body: { email, password } });
}

export async function refreshSession(cookieHeader?: string): Promise<AuthResponse | null> {
  try {
    return await apiFetch<AuthResponse>("/v1/auth/refresh", { method: "POST", cookieHeader });
  } catch {
    return null;
  }
}

export async function fetchMe(accessToken: string): Promise<{ user: UserContext }> {
  return apiFetch<{ user: UserContext }>("/v1/me", { accessToken });
}

export async function logout(accessToken: string): Promise<void> {
  await apiFetch("/v1/auth/logout", { method: "POST", accessToken });
}
