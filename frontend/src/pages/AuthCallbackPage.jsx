import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'

export default function AuthCallbackPage() {
  const [params]  = useSearchParams()
  const navigate  = useNavigate()
  const { refreshUser } = useAuth()

  useEffect(() => {
    const error  = params.get('error')
    const status = params.get('status')

    if (error) {
      navigate(`/login?error=${error}`, { replace: true })
      return
    }

    ;(async () => {
      // JWT cookie is already set by Flask — just hydrate the context
      const user = await refreshUser()
      if (!user) {
        navigate('/login?error=auth_failed', { replace: true })
        return
      }
      if (status === 'pending_verification') {
        navigate('/verify-otp', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <LoadingSpinner fullscreen label="Setting up your account…" />
}
