import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({
  children,
  roles           = null,
  requireVerified = false,
  requireOnboarded = true,
  requireRole     = null,
}) {
  const { user, isAuthenticated, isVerified, isOnboarded, isApproved, hasRole, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingSpinner fullscreen label="Loading…" />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!isVerified) return <Navigate to="/verify-otp" replace />

  // New user — redirect to onboarding (except if already on /onboarding)
  // Faculty bypass onboarding entirely
  if (requireOnboarded && isAuthenticated && user?.role !== 'faculty' && user?.role !== 'admin') {
    if (!isOnboarded || !isApproved) {
      if (location.pathname !== '/onboarding') {
        return <Navigate to="/onboarding" replace />
      }
    }
  }

  // Role check (supports both legacy array prop and new requireRole string)
  const roleToCheck = requireRole || (roles && roles.length > 0 ? roles : null)
  if (roleToCheck) {
    const roleArray = Array.isArray(roleToCheck) ? roleToCheck : [roleToCheck]
    if (!hasRole(...roleArray)) return <Navigate to="/dashboard" replace />
  }

  return children
}
