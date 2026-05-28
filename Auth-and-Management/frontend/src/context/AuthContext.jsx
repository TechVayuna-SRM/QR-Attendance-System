/**
 * AuthContext — global authentication state.
 *
 * Provides:
 *   user          – the current user object or null
 *   loading       – true while /auth/me is in flight on first load
 *   isVerified    – shorthand for user?.is_verified
 *   hasRole(role) – checks user.roles array
 *   logout()      – calls /auth/logout, then clears state
 *   refreshUser() – re-fetches /auth/me (useful after profile edits)
 */
import {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
} from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const initialized = useRef(false)

  // ── Fetch current user from /auth/me ──────────────────────────────────────
  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me')
      setUser(data.user)
      return data.user
    } catch {
      setUser(null)
      return null
    }
  }, [])

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    setUser(null)
  }, [])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // If this is a completely new tab/window, force a fresh login session
    if (!sessionStorage.getItem('tab_active')) {
      sessionStorage.setItem('tab_active', 'true')
      logout().finally(() => setLoading(false))
    } else {
      refreshUser().finally(() => setLoading(false))
    }
  }, [refreshUser, logout])

  // ── Listen for the auth:logout event fired by the Axios interceptor ───────
  useEffect(() => {
    const handler = () => { setUser(null) }
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [])



  // ── Role helper ───────────────────────────────────────────────────────────
  const hasRole = useCallback((...roles) => {
    if (!user?.roles) return false
    return roles.some(r => user.roles.includes(r))
  }, [user])

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isEmailVerified: !!user?.is_verified,
    isVerified: !!user?.login_verified,
    hasRole,
    logout,
    refreshUser,
    setUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
