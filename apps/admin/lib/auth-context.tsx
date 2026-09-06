"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  ApiError,
  apiFetch,
  logout as apiLogout,
  refreshSession,
  type UserContext
} from "./api-client";

interface FetchOptions {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
}

interface AuthContextValue {
  user: UserContext | null;
  accessToken: string | null;
  setSession: (accessToken: string, user: UserContext) => void;
  clearSession: () => void;
  logout: () => Promise<void>;
  authorizedFetch: <T>(path: string, options?: FetchOptions) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  initialUser: UserContext | null;
  initialAccessToken: string | null;
  children: ReactNode;
}

export function AuthProvider({ initialUser, initialAccessToken, children }: AuthProviderProps) {
  const [user, setUser] = useState<UserContext | null>(initialUser);
  const [accessToken, setAccessToken] = useState<string | null>(initialAccessToken);

  const setSession = useCallback((token: string, nextUser: UserContext) => {
    setAccessToken(token);
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    if (accessToken) await apiLogout(accessToken).catch(() => undefined);
    clearSession();
    window.location.href = "/login";
  }, [accessToken, clearSession]);

  const authorizedFetch = useCallback(
    async <T,>(path: string, options: FetchOptions = {}): Promise<T> => {
      try {
        return await apiFetch<T>(path, { ...options, accessToken });
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 401) {
          const refreshed = await refreshSession();
          if (refreshed) {
            setSession(refreshed.accessToken, refreshed.user);
            return apiFetch<T>(path, { ...options, accessToken: refreshed.accessToken });
          }
          clearSession();
          window.location.href = "/login";
        }
        throw error;
      }
    },
    [accessToken, clearSession, setSession]
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, accessToken, setSession, clearSession, logout, authorizedFetch }),
    [user, accessToken, setSession, clearSession, logout, authorizedFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider.");
  return context;
}
