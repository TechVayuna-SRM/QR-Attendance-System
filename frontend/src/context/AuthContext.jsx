import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import api from "../api/axios";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const initialized           = useRef(false);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    setUser(null);
  }, []);

  // Initial load — try to hydrate from cookie
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  // Listen for the auth:logout event fired by the Axios interceptor
  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener("auth:logout", handler);
    return () => window.removeEventListener("auth:logout", handler);
  }, []);

  const hasRole = useCallback((...roles) => {
    if (!user) return false;
    // Support both legacy single-role string and new roles array
    if (Array.isArray(user.roles)) return roles.some(r => user.roles.includes(r));
    if (user.role) return roles.includes(user.role);
    return false;
  }, [user]);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isVerified:      !!user?.login_verified,
    isEmailVerified: !!user?.is_verified,
    isOnboarded:     !!(user?.regno || user?.registration_number),
    isApproved:      !!user?.is_approved,
    hasRole,
    logout,
    refreshUser,
    setUser,
    // Legacy compat: saveTokens is a no-op (cookies are set by server)
    saveTokens: () => {},
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
};
