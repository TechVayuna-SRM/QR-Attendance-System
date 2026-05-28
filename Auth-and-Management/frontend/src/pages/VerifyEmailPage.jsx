import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import OTPInput from '../components/OTPInput'
import api from '../api/axios'
import './VerifyEmailPage.css'

const RESEND_COOLDOWN = 60 // seconds

export default function VerifyEmailPage() {
  const { user, refreshUser, isVerified } = useAuth()
  const navigate = useNavigate()

  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [countdown, setCountdown] = useState(0)

  // Already verified → go to profile
  useEffect(() => {
    if (isVerified) navigate('/profile', { replace: true })
  }, [isVerified, navigate])

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const handleVerify = async (e) => {
    e?.preventDefault()
    if (otp.length !== 6) { setError('Please enter all 6 digits.'); return }

    setLoading(true)
    setError('')
    try {
      await api.post('/auth/verify-otp', { otp })
      setSuccess(true)
      await refreshUser()
      setTimeout(() => navigate('/profile'), 1800)
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed. Please try again.')
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = useCallback(async () => {
    setError('')
    try {
      await api.post('/auth/resend-otp')
      setCountdown(RESEND_COOLDOWN)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend OTP.')
    }
  }, [])

  const displayId = user?.registration_number || 'your registered email'

  if (success) {
    return (
      <div className="verify-page">
        <div className="verify-card glass-card fade-in">
          <div className="verify-success">
            <div className="verify-success-icon">✅</div>
            <h2>Email Verified!</h2>
            <p>Redirecting you to your profile…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="verify-page">
      <div className="verify-card glass-card fade-in">
        {/* Header */}
        <div className="verify-header">
          <div className="verify-icon-wrap">
            <span className="verify-icon">📧</span>
            <div className="verify-icon-ring" />
          </div>
          <h1>Verify Your Email</h1>
          <p>
            We sent a 6-digit code to{' '}
            <strong className="verify-email">{displayId}</strong>
          </p>
          <p className="verify-expiry">The code expires in 15 minutes.</p>
        </div>

        {/* OTP Form */}
        <form onSubmit={handleVerify} className="verify-form" id="otp-form">
          <OTPInput
            value={otp}
            onChange={setOtp}
            disabled={loading}
            error={!!error}
          />

          {error && (
            <div className="alert alert-error" role="alert">
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            id="verify-otp-btn"
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading || otp.length < 6}
          >
            {loading ? (
              <><span className="spin">⟳</span> Verifying…</>
            ) : (
              '🔓 Verify Email'
            )}
          </button>
        </form>

        {/* Resend */}
        <div className="verify-resend">
          <span>Didn't receive it?</span>
          {countdown > 0 ? (
            <span className="verify-countdown">Resend in {countdown}s</span>
          ) : (
            <button
              id="resend-otp-btn"
              className="btn btn-ghost btn-sm"
              onClick={handleResend}
              type="button"
            >
              Resend OTP
            </button>
          )}
        </div>

        <div className="divider" />
        <p className="verify-tip">
          Check your spam folder if you didn't receive the email.{' '}
          Make sure <strong>{displayId}</strong> is correct.
        </p>
      </div>
    </div>
  )
}
