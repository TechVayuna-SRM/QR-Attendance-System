import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function OnboardingPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    name: user?.name || '',
    registration_number: '',
    year: '1',
    department: '',
    section: '',
  })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // If user is already fully onboarded and approved, redirect them
  useEffect(() => {
    if (user?.registration_number && user?.is_approved) {
      navigate('/profile', { replace: true })
    }
  }, [user, navigate])

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
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
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit onboarding details.')
    } finally {
      setIsLoading(false)
    }
  }

  // Render pending state if they have a reg no but are not approved
  if (user?.registration_number && !user?.is_approved) {
    return (
      <div className="page-wrapper">
        <div className="container" style={{ maxWidth: '600px', textAlign: 'center', marginTop: '10vh' }}>
          <div className="glass-card" style={{ padding: '40px' }}>
            <h2 style={{ marginBottom: '16px' }}>Account Pending Approval</h2>
            <p className="text-secondary" style={{ marginBottom: '24px' }}>
              Your registration details have been submitted successfully. 
              An administrator must approve your account before you can access the dashboard.
            </p>
            <div className="shimmer" style={{ height: '4px', width: '100%', borderRadius: '2px', marginBottom: '24px' }}></div>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>
              Please check back later or contact an administrator.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      <div className="container" style={{ maxWidth: '500px', marginTop: '5vh' }}>
        <div className="glass-card fade-in" style={{ padding: '32px' }}>
          <h2 style={{ marginBottom: '8px' }}>Complete Your Profile</h2>
          <p className="text-secondary" style={{ marginBottom: '24px' }}>
            Please provide your academic details to continue.
          </p>

          {error && <div className="alert alert-error" style={{ marginBottom: '20px' }}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="input-group">
              <label className="input-label">Full Name</label>
              <input
                type="text"
                name="name"
                className="input-field"
                value={formData.name}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Registration Number</label>
              <input
                type="text"
                name="registration_number"
                className="input-field"
                placeholder="e.g. RAXXXXXXXXXXXXX"
                value={formData.registration_number}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Year of Study</label>
              <select
                name="year"
                className="input-field"
                value={formData.year}
                onChange={handleChange}
                disabled={isLoading}
                style={{ appearance: 'auto' }}
              >
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Department</label>
              <input
                type="text"
                name="department"
                className="input-field"
                placeholder="e.g. Computer Science"
                value={formData.department}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Section</label>
              <input
                type="text"
                name="section"
                className="input-field"
                placeholder="e.g. A1"
                value={formData.section}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ marginTop: '8px' }}>
              {isLoading ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
