import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "./api.js";

export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<CurrentUser>("/api/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      const loggedInUser = await api.post<CurrentUser>("/api/auth/login", { email, password });
      setUser(loggedInUser);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong logging in.");
      throw err;
    }
  }

  async function logout() {
    await api.post("/api/auth/logout");
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, error, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
