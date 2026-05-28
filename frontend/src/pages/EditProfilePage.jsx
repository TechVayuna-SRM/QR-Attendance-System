import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { ArrowLeft, Save, Upload, User } from 'lucide-react'
import './EditProfilePage.css'

export default function EditProfilePage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState(user?.name ?? '')
  const [year, setYear] = useState(user?.year ?? '1st')
  const [department, setDepartment] = useState(user?.department ?? '')
  const [section, setSection] = useState(user?.section ?? '')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.png')) {
      setError('Only PNG files are allowed.')
      return
    }
    setError('')
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name cannot be empty.'); return }
    setLoading(true)
    setError('')
    try {
      // Upload avatar first if a new file was selected
      if (avatarFile) {
        const formData = new FormData()
        formData.append('file', avatarFile)
        await api.post('/profile/avatar', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }
      // Save other profile fields
      await api.put('/profile/edit', {
        name: name.trim(),
        year,
        department: department.trim(),
        section: section.trim(),
      })
      await refreshUser()
      setSaved(true)
      setTimeout(() => navigate('/profile'), 1500)
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="edit-page page-wrapper">
      <div className="container">
        <div className="edit-wrap fade-in">

          {/* Back */}
          <Link to="/profile" className="btn btn-ghost btn-sm edit-back">
            <ArrowLeft size={16} /> Back to Profile
          </Link>

          <div className="edit-card glass-card">
            <h1 className="edit-title">Edit Profile</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
              Update your display name, academic details, and profile picture.
            </p>

            <form onSubmit={handleSave} id="edit-profile-form">

              {/* ── Avatar Upload ──────────────────── */}
              <section className="edit-section">
                <h2 className="section-title"><Upload size={16} /> Profile Picture</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                  {/* Preview */}
                  <div style={{ flexShrink: 0 }}>
                    {avatarPreview
                      ? <img src={avatarPreview} alt="Avatar preview"
                          style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border-primary)', boxShadow: '0 0 20px var(--primary-glow)' }}
                        />
                      : <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: '#fff', fontWeight: 700 }}>
                          {user?.name?.charAt(0).toUpperCase()}
                        </div>
                    }
                  </div>
                  {/* File picker */}
                  <div>
                    <label
                      htmlFor="avatar-upload"
                      className="btn btn-secondary"
                      style={{ cursor: 'pointer' }}
                    >
                      <Upload size={16} /> Choose PNG file
                    </label>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept=".png,image/png"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    {avatarFile && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6 }}>
                        Selected: {avatarFile.name}
                      </p>
                    )}
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      PNG files only. Recommended: square image.
                    </p>
                  </div>
                </div>
              </section>

              {/* ── Personal Info ─────────────────── */}
              <section className="edit-section">
                <h2 className="section-title"><User size={16} /> Personal Info</h2>
                <div className="edit-field-row">
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label" htmlFor="edit-name">Full Name</label>
                    <input
                      id="edit-name"
                      className="input-field"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      maxLength={255}
                      placeholder="Your display name"
                      required
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">Registration Number</label>
                    <input
                      className="input-field"
                      value={user?.registration_number ?? ''}
                      disabled
                      readOnly
                      title="Registration number cannot be changed."
                    />
                  </div>
                </div>
              </section>

              {/* ── Academic Info ─────────────────── */}
              <section className="edit-section">
                <h2 className="section-title">🎓 Academic Info</h2>
                <div className="edit-field-row">
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">Year</label>
                    <select
                      className="input-field"
                      value={year}
                      onChange={e => setYear(e.target.value)}
                    >
                      <option value="1st">1st Year</option>
                      <option value="2nd">2nd Year</option>
                      <option value="3rd">3rd Year</option>
                      <option value="4th">4th Year</option>
                    </select>
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">Department</label>
                    <input
                      className="input-field"
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                      placeholder="e.g. CSE, ECE"
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">Section</label>
                    <input
                      className="input-field"
                      value={section}
                      onChange={e => setSection(e.target.value)}
                      placeholder="e.g. A, B"
                    />
                  </div>
                </div>
              </section>

              {/* ── Errors / Success ─────────── */}
              {error && (
                <div className="alert alert-error" role="alert">⚠️ {error}</div>
              )}
              {saved && (
                <div className="alert alert-success">✅ Profile saved! Redirecting…</div>
              )}

              {/* ── Actions ──────────────────── */}
              <div className="edit-actions">
                <Link to="/profile" className="btn btn-secondary">Cancel</Link>
                <button
                  id="save-profile-btn"
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || saved}
                >
                  {loading
                    ? <><span className="spin">⟳</span> Saving…</>
                    : <><Save size={16} /> Save Changes</>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
