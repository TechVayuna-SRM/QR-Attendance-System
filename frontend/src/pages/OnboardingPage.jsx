import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function OnboardingPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1) // 1 = profile form, 2 = face registration
  const [formData, setFormData] = useState({
    name: user?.name || '',
    registration_number: '',
    year: '1',
    department: '',
    section: '',
    role: 'member',
  })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Face registration state
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [faceLoading, setFaceLoading] = useState(false)
  const [faceError, setFaceError] = useState('')
  const [faceDone, setFaceDone] = useState(false)

  // If already fully onboarded and approved, redirect
  useEffect(() => {
    if (user?.registration_number && user?.is_approved) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  // Start camera when entering step 2
  useEffect(() => {
    if (step === 2) startCamera()
    return () => stopCamera()
  }, [step])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraReady(true)
    } catch {
      setFaceError('Camera access denied. You can skip and register your face later from the dashboard.')
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraReady(false)
  }

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.registration_number || !formData.department || !formData.section) {
      setError('Please fill in all fields.')
      return
    }
    try {
      setIsLoading(true)
      setError('')
      await api.post('/auth/complete-onboarding', formData)
      await refreshUser()
      setStep(2)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit onboarding details.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCaptureFace = async () => {
    if (!videoRef.current) return
    setFaceLoading(true)
    setFaceError('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width  = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      canvas.getContext('2d').drawImage(videoRef.current, 0, 0)
      const b64 = canvas.toDataURL('image/jpeg')
      await api.post('/attendance/register-face', { image: b64 })
      stopCamera()
      setFaceDone(true)
      await refreshUser()
      setTimeout(() => navigate('/dashboard'), 1800)
    } catch (err) {
      setFaceError(err.response?.data?.error || 'Face registration failed. Please try again.')
    } finally {
      setFaceLoading(false)
    }
  }

  const handleSkipFace = () => {
    stopCamera()
    navigate('/dashboard')
  }

  // ── Pending approval screen ───────────────────────────────────────────────
  if (user?.registration_number && !user?.is_approved) {
    return (
      <div className="page-wrapper">
        <div className="container" style={{ maxWidth: '600px', textAlign: 'center', marginTop: '10vh' }}>
          <div className="glass-card" style={{ padding: '40px' }}>
            <h2 style={{ marginBottom: '16px' }}>Account Pending Approval</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Your registration details have been submitted successfully.
              An administrator must approve your account before you can access the dashboard.
            </p>
            <div className="shimmer" style={{ height: '4px', width: '100%', borderRadius: '2px', marginBottom: '24px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Please check back later or contact an administrator.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      <div className="container" style={{ maxWidth: '520px', marginTop: '5vh' }}>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
          {[1, 2].map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700,
                background: step >= s ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 'var(--bg-tertiary)',
                color: step >= s ? '#fff' : 'var(--text-muted)',
                border: step >= s ? 'none' : '1px solid var(--border)',
              }}>{s}</div>
              {s < 2 && <div style={{ width: '40px', height: '2px', background: step > s ? 'var(--primary)' : 'var(--border)' }} />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Profile form ── */}
        {step === 1 && (
          <div className="glass-card fade-in" style={{ padding: '32px' }}>
            <h2 style={{ marginBottom: '8px' }}>Complete Your Profile</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.88rem' }}>
              Please provide your academic details to continue.
            </p>

            {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>⚠️ {error}</div>}

            <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group">
                <label className="input-label">Full Name</label>
                <input type="text" name="name" className="input-field"
                  value={formData.name} onChange={handleChange} disabled={isLoading} />
              </div>
              <div className="input-group">
                <label className="input-label">Registration Number</label>
                <input type="text" name="registration_number" className="input-field"
                  placeholder="e.g. RAXXXXXXXXXXXXX"
                  value={formData.registration_number} onChange={handleChange} disabled={isLoading} />
              </div>
              <div className="input-group">
                <label className="input-label">Year of Study</label>
                <select name="year" className="input-field" value={formData.year}
                  onChange={handleChange} disabled={isLoading} style={{ appearance: 'auto' }}>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Department</label>
                <input type="text" name="department" className="input-field"
                  placeholder="e.g. Computer Science"
                  value={formData.department} onChange={handleChange} disabled={isLoading} />
              </div>
              <div className="input-group">
                <label className="input-label">Section</label>
                <input type="text" name="section" className="input-field"
                  placeholder="e.g. A1"
                  value={formData.section} onChange={handleChange} disabled={isLoading} />
              </div>
              <div className="input-group">
                <label className="input-label">Role</label>
                <select name="role" className="input-field" value={formData.role}
                  onChange={handleChange} disabled={isLoading} style={{ appearance: 'auto' }}>
                  <option value="member">Member</option>
                  <option value="domain_lead">Domain Lead</option>
                  <option value="president">President</option>
                  <option value="vice_president">Vice President</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ marginTop: '8px' }}>
                {isLoading ? <><span className="spin">⟳</span> Submitting…</> : 'Next: Register Face →'}
              </button>
            </form>
          </div>
        )}

        {/* ── Step 2: Face registration ── */}
        {step === 2 && (
          <div className="glass-card fade-in" style={{ padding: '32px' }}>
            <h2 style={{ marginBottom: '8px' }}>📸 Register Your Face</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '20px' }}>
              Face is registered <strong>once only</strong> and cannot be changed.
              It is used for attendance verification via QR scan.
            </p>

            {faceDone ? (
              <div className="alert alert-success">✅ Face registered! Redirecting…</div>
            ) : (
              <>
                {/* Camera preview */}
                <div style={{ position: 'relative', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--bg-tertiary)', marginBottom: '16px', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <video ref={videoRef} autoPlay playsInline
                    style={{ width: '100%', display: 'block', borderRadius: 'var(--r-lg)' }} />
                  {!cameraReady && !faceError && (
                    <p style={{ color: 'var(--text-muted)', padding: '20px' }}>Starting camera…</p>
                  )}
                </div>

                {faceError && (
                  <div className="alert alert-error" style={{ marginBottom: '12px' }}>⚠️ {faceError}</div>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={handleCaptureFace}
                    disabled={faceLoading || !cameraReady}
                  >
                    {faceLoading ? <><span className="spin">⟳</span> Registering…</> : '📸 Capture & Register'}
                  </button>
                  <button className="btn btn-secondary" onClick={handleSkipFace} disabled={faceLoading}>
                    Skip
                  </button>
                </div>

                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '12px', textAlign: 'center' }}>
                  You can only register your face once. Skipping means you won't be able to mark attendance until you register it from the dashboard.
                </p>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
