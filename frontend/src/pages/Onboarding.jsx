import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function Onboarding() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1) // 1=profile, 2=face
  const [domains, setDomains] = useState([])
  const [selectedDomains, setSelectedDomains] = useState([])
  const [formData, setFormData] = useState({
    name: user?.name || '',
    registration_number: '',
    year: '1st Year',
    department: '',
    role: 'member',
  })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const videoRef = useRef(null)

  useEffect(() => {
    api.get('/analytics/domains').then(r => setDomains(r.data)).catch(() => {})
  }, [])

  // Already onboarded → go to dashboard
  useEffect(() => {
    if (user?.regno) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const isFaculty = formData.role === 'faculty'

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const toggleDomain = (id) => {
    setSelectedDomains(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
  }

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.department) { setError('Name and department are required.'); return }
    if (!isFaculty && (!formData.registration_number || !formData.year)) { setError('Registration number and year are required.'); return }
    if (!isFaculty && selectedDomains.length === 0) { setError('Select at least one domain.'); return }

    try {
      setIsLoading(true)
      setError('')
      await api.post('/auth/complete-onboarding', {
        ...formData,
        domain_ids: selectedDomains,
      })
      await refreshUser()
      // Move to face registration step
      setStep(2)
      startCamera()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit details.')
    } finally {
      setIsLoading(false)
    }
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch (err) {
      setError('Camera access denied. You can register your face later from the dashboard.')
    }
  }

  const captureAndRegister = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0)
    const b64 = canvas.toDataURL('image/jpeg')
    try {
      setIsLoading(true)
      await api.post('/attendance/register-face', { image: b64 })
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Face registration failed.')
    } finally {
      setIsLoading(false)
    }
  }

  const skipFace = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
    }
    navigate('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', justifyContent: 'center' }}>
          {[1, 2].map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700,
                background: step >= s ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 'var(--bg-tertiary)',
                color: step >= s ? '#fff' : 'var(--text-muted)',
                border: step >= s ? 'none' : '1px solid var(--border)',
              }}>{s}</div>
              {s < 2 && <div style={{ width: '40px', height: '2px', background: step > s ? 'var(--primary)' : 'var(--border)' }} />}
            </div>
          ))}
        </div>

        <div className="glass-card fade-in" style={{ padding: '36px 32px' }}>

          {/* ── Step 1: Profile ── */}
          {step === 1 && (
            <>
              <h2 style={{ marginBottom: '6px', color: 'var(--text-primary)' }}>Complete Your Profile</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '24px' }}>
                Please provide your academic details to continue.
              </p>

              {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>⚠️ {error}</div>}

              <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                <div className="input-group">
                  <label className="input-label">Full Name</label>
                  <input name="name" className="input-field" value={formData.name} onChange={handleChange} disabled={isLoading} />
                </div>

                <div className="input-group">
                  <label className="input-label">Role</label>
                  <select name="role" className="input-field" value={formData.role} onChange={handleChange} disabled={isLoading} style={{ appearance: 'auto' }}>
                    <option value="member">👨‍🎓 Club Member</option>
                    <option value="domain_lead">🏆 Domain Lead</option>
                    <option value="admin">🛡️ Admin</option>
                    <option value="faculty">🎓 Faculty</option>
                  </select>
                </div>

                {!isFaculty && (
                  <div className="input-group">
                    <label className="input-label">Registration Number</label>
                    <input name="registration_number" className="input-field" placeholder="e.g. RAXXXXXXXXXXXXX"
                      value={formData.registration_number} onChange={handleChange} disabled={isLoading} />
                  </div>
                )}

                <div className="input-group">
                  <label className="input-label">Department</label>
                  <input name="department" className="input-field" placeholder="e.g. Computer Science"
                    value={formData.department} onChange={handleChange} disabled={isLoading} />
                </div>

                {!isFaculty && (
                  <div className="input-group">
                    <label className="input-label">Year of Study</label>
                    <select name="year" className="input-field" value={formData.year} onChange={handleChange} disabled={isLoading} style={{ appearance: 'auto' }}>
                      {['1st Year', '2nd Year', '3rd Year', '4th Year'].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                )}

                {!isFaculty && (
                  <div className="input-group">
                    <label className="input-label">Domains <span style={{ color: 'var(--error)' }}>*</span></label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                      {domains.map(d => {
                        const selected = selectedDomains.includes(d.id)
                        return (
                          <div key={d.id} onClick={() => toggleDomain(d.id)} style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '9px 12px', borderRadius: 'var(--r-md)', fontSize: '13px',
                            cursor: 'pointer', userSelect: 'none',
                            border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                            background: selected ? 'var(--primary-subtle)' : 'var(--bg-input)',
                            color: selected ? 'var(--primary-light)' : 'var(--text-secondary)',
                          }}>
                            <span style={{
                              width: '16px', height: '16px', minWidth: '16px', borderRadius: '3px',
                              border: `2px solid ${selected ? 'var(--primary)' : 'var(--text-muted)'}`,
                              background: selected ? 'var(--primary)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '11px', color: '#fff', fontWeight: 'bold',
                            }}>{selected ? '✓' : ''}</span>
                            {d.name}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <button type="submit" className="btn btn-primary btn-full" disabled={isLoading} style={{ marginTop: '8px' }}>
                  {isLoading ? <><span className="spin">⟳</span> Submitting…</> : 'Next: Register Face →'}
                </button>
              </form>
            </>
          )}

          {/* ── Step 2: Face Registration ── */}
          {step === 2 && (
            <>
              <h2 style={{ marginBottom: '6px', color: 'var(--text-primary)' }}>📸 Register Your Face</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '20px' }}>
                Face is registered once and cannot be changed. Used for attendance verification.
              </p>

              {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>⚠️ {error}</div>}

              <video ref={videoRef} autoPlay style={{ width: '100%', borderRadius: 'var(--r-lg)', marginBottom: '16px', background: 'var(--bg-tertiary)' }} />

              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={captureAndRegister} disabled={isLoading}>
                  {isLoading ? <><span className="spin">⟳</span> Registering…</> : '📸 Capture & Register'}
                </button>
                <button className="btn btn-secondary" onClick={skipFace} disabled={isLoading}>
                  Skip
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
