import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'

/**
 * AuthCallbackPage
 *
 * Flask redirects here after Google OAuth completes.
 * URL params:
 *   ?status=verified             → go to /profile
 *   ?status=pending_verification → go to /verify-email
 *   ?error=...                   → show error and go to /login
 */
export default function AuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  useEffect(() => {
    const status = params.get('status')
    const error = params.get('error')

    if (error) {
      navigate(`/login?error=${error}`, { replace: true })
      return
    }

    ; (async () => {
      // The JWT cookie is already set by Flask.
      // We call /auth/me to hydrate the AuthContext.
      const user = await refreshUser()

      if (!user) {
        navigate('/login?error=auth_failed', { replace: true })
        return
      }

      if (status === 'pending_verification') {
        navigate('/verify-email', { replace: true })
      } else if (status === 'verified') {
        navigate('/profile', { replace: true })
      } else {
        navigate('/login?error=auth_failed', { replace: true })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <LoadingSpinner
      fullscreen
      label="Setting up your account…"
    />
  )
}
