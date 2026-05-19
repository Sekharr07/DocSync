import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

interface User {
  id: string;
  email: string;
  username: string;
}

function normalizeUser(raw: any): User {
  return {
    id: String(raw?.id ?? raw?._id ?? ""),
    email: String(raw?.email ?? ""),
    username: String(raw?.username ?? ""),
  };
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API = axios.create({ baseURL: "/api" });

let authInterceptorInstalled = false;

function readStoredToken(): string | null {
  return localStorage.getItem("token");
}

function ensureAuthInterceptor() {
  if (authInterceptorInstalled) return;

  API.interceptors.request.use((config) => {
    const token = readStoredToken();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  authInterceptorInstalled = true;
}

ensureAuthInterceptor();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentToken = token ?? readStoredToken();
    if (!currentToken) { setLoading(false); return; }
    API.get("/auth/me")
      .then((r) => setUser(normalizeUser(r.data.user)))
      .catch(() => { localStorage.removeItem("token"); setToken(null); })
      .finally(() => setLoading(false));
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await API.post("/auth/login", { email, password });
    localStorage.setItem("token", r.data.token);
    setToken(r.data.token);
    setUser(normalizeUser(r.data.user));
  }, []);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const r = await API.post("/auth/register", { email, username, password });
    localStorage.setItem("token", r.data.token);
    setToken(r.data.token);
    setUser(normalizeUser(r.data.user));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export { API };