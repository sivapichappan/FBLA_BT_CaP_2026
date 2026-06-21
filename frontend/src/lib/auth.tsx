/**
 * Auth context: current user + token lifecycle for the whole app.
 * On mount, an existing token is validated against /auth/me (an expired or
 * revoked token gets cleared instead of leaving a half-signed-in UI).
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ApiError, authApi, tokenStore } from "./api";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  /** True while the stored token is being validated on first load. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Exchange a Google ID token (from the "Sign in with Google" button) for a session. */
  loginWithGoogle: (credential: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    username?: string;
    role?: "user" | "owner";
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(!!tokenStore.get());

  // Validate any stored token once on app load.
  useEffect(() => {
    if (!tokenStore.get()) return;
    authApi
      .me()
      .then(setUser)
      .catch((err: unknown) => {
        // 401 → stale token; clear it. A network error keeps the token for retry.
        if (err instanceof ApiError && err.status === 401) tokenStore.clear();
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await authApi.login(email, password);
    tokenStore.set(res.access_token);
    setUser(res.user);
  }

  async function loginWithGoogle(credential: string) {
    // Same outcome as password login — the backend hands back our own token.
    const res = await authApi.google(credential);
    tokenStore.set(res.access_token);
    setUser(res.user);
  }

  async function register(data: {
    email: string;
    password: string;
    username?: string;
    role?: "user" | "owner";
  }) {
    const res = await authApi.register(data);
    tokenStore.set(res.access_token);
    setUser(res.user);
  }

  function logout() {
    tokenStore.clear();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, loginWithGoogle, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Hook: `const { user, login, logout } = useAuth()` anywhere under the provider. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
