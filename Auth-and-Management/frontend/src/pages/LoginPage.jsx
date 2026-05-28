import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import './LoginPage.css'

export default function LoginPage() {
  const { isAuthenticated, isVerified, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [registrationNumber, setRegistrationNumber] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Already logged in → redirect
  useEffect(() => {
    if (isAuthenticated) {
      navigate(isVerified ? '/profile' : '/verify-email', { replace: true })
    }
  }, [isAuthenticated, isVerified, navigate])

  const handleRegNoLogin = async (e) => {
    e.preventDefault()
    if (!registrationNumber.trim()) {
      setError('Please enter your registration number')
      return
    }

    try {
      setIsLoading(true)
      setError('')
      await api.post('/auth/request-otp', { registration_number: registrationNumber })
      // Refresh auth context so it knows we have a pre-auth session
      await refreshUser()
      // The useEffect above will handle the redirect to /verify-email
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google'
  }

  return (
    <div className="login-page">
      {/* Animated background */}
      <div className="login-bg">
        <div className="login-grid" />
      </div>

      <div className="login-card glass-card fade-in">
        {/* Header */}
        <div className="login-header">
          <div className="login-logo" style={{ background: 'transparent', boxShadow: 'none' }}>
            <img src="/logo.png" alt="TechVayana Logo" style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: '12px' }} />
          </div>
          <h1 className="login-title">
            Welcome to <span className="gradient-text">TechVayana</span>
          </h1>
          <p className="login-subtitle">
            Secure attendance management with Google Sign-In
          </p>
        </div>

        {/* Existing User Login */}
        <form className="login-features" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} onSubmit={handleRegNoLogin}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="input-group">
            <label className="input-label">Registration Number</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. RAXXXXXXXXXXXXX"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send OTP'}
          </button>
        </form>

        <div className="divider">new user?</div>

        {/* Google Sign-In */}
        <button
          id="google-signin-btn"
          className="btn btn-google btn-full"
          onClick={handleGoogleLogin}
        >
          {/* Official Google "G" logo as inline SVG */}
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign up with Google
        </button>

        <p className="login-terms">
          By signing in, you agree to our{' '}
          <a href="#terms">Terms of Service</a> and{' '}
          <a href="#privacy">Privacy Policy</a>.
          Your email will be verified via OTP after sign-in.
        </p>
      </div>

      {/* Footer */}
      <p className="login-footer">
        QR Attendance System &copy; {new Date().getFullYear()} &bull; Built for clubs &amp; events
      </p>
    </div>
  )
}
