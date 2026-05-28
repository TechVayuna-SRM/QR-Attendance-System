import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import RoleBadge from '../components/RoleBadge'
import DomainSelector from '../components/DomainSelector'
import api from '../api/axios'
import { Edit3, Hash, Mail, Calendar, Globe, Fingerprint, Shield, GraduationCap, Plus, X, Save, Clock } from 'lucide-react'
import './ProfilePage.css'

export default function ProfilePage() {
  const { user, refreshUser } = useAuth()

  // Domain join panel state
  const [showJoin, setShowJoin] = useState(false)
  const [allDomains, setAllDomains] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [selected, setSelected] = useState([])
  const [fetchingDomains, setFetchingDomains] = useState(false)
  const [savingDomains, setSavingDomains] = useState(false)
  const [domainError, setDomainError] = useState('')
  const [domainSuccess, setDomainSuccess] = useState(false)

  const ledDomainIds = new Set(user?.led_domains?.map(d => d.id) ?? [])

  const loadDomains = useCallback(async () => {
    setFetchingDomains(true)
    setDomainError('')
    try {
      const [domainsRes, reqRes] = await Promise.all([
        api.get('/profile/domains/all'),
        api.get('/profile/requests')
      ])
      setAllDomains(domainsRes.data.domains)
      const currentIds = user?.domains?.map(d => d.id) ?? []
      const pendingIds = (reqRes.data.requests ?? []).map(r => r.domain_id)
      setPendingRequests(reqRes.data.requests ?? [])
      setSelected([...new Set([...currentIds, ...pendingIds])])
    } catch {
      setDomainError('Failed to load domains. Please try again.')
    } finally {
      setFetchingDomains(false)
    }
  }, [user])

  const handleOpenJoin = () => {
    setShowJoin(true)
    setDomainSuccess(false)
    loadDomains()
  }

  const handleSaveDomains = async () => {
    setSavingDomains(true)
    setDomainError('')
    try {
      await api.put('/profile/domains', { domain_ids: selected })
      await refreshUser()
      setDomainSuccess(true)
      setTimeout(() => setShowJoin(false), 1500)
    } catch (err) {
      setDomainError(err.response?.data?.error || 'Failed to save domain selections.')
    } finally {
      setSavingDomains(false)
    }
  }

  if (!user) return null

  const joinDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    : '—'

  const pendingDomainIds = new Set(pendingRequests.map(r => r.domain_id))

  return (
    <div className="profile-page page-wrapper">
      <div className="container">
        <div className="profile-grid fade-in">

          {/* ── Left: identity card ──────────────────────── */}
          <div className="profile-identity glass-card">
            {/* Avatar */}
            <div className="profile-avatar-wrap">
              {user.avatar_url
                ? <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="profile-avatar"
                />
                : <div className="profile-avatar-placeholder">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              }
              <div className="profile-avatar-ring" />
            </div>

            <h1 className="profile-name">{user.name}</h1>
            <p className="profile-email">
              <Mail size={14} style={{ display: 'inline', marginRight: 5 }} />
              {user.email}
            </p>
            <p className="profile-email">
              <Hash size={14} style={{ display: 'inline', marginRight: 5 }} />
              {user.registration_number}
            </p>

            {/* Badges */}
            <div className="profile-badges">
              <span className={`badge ${user.is_verified ? 'badge-verified' : 'badge-unverified'}`}>
                {user.is_verified ? '✅ Verified' : '⏳ Unverified'}
              </span>
              <RoleBadge roles={user.roles} />
            </div>

            {/* Stats */}
            <div className="profile-stats">
              <div className="profile-stat">
                <Globe size={16} />
                <span>{user.domains?.length ?? 0} Domains</span>
              </div>
              <div className="profile-stat">
                <Fingerprint size={16} />
                <span>{user.face_registered ? 'Face Registered' : 'No Face Data'}</span>
              </div>
              <div className="profile-stat">
                <Calendar size={16} />
                <span>Joined {joinDate}</span>
              </div>
            </div>

            {/* Academic Info */}
            {(user.year || user.department || user.section) && (
              <div className="profile-stats" style={{ marginTop: '12px', gridTemplateColumns: '1fr', gap: '6px' }}>
                <div className="profile-stat" style={{ justifyContent: 'flex-start' }}>
                  <GraduationCap size={16} />
                  <span>
                    {[user.year && `Year ${user.year}`, user.department, user.section && `Section ${user.section}`]
                      .filter(Boolean).join(' • ')}
                  </span>
                </div>
              </div>
            )}

            {/* Edit button */}
            <Link
              id="edit-profile-btn"
              to="/profile/edit"
              className="btn btn-primary btn-full"
              style={{ marginTop: 16 }}
            >
              <Edit3 size={16} /> Edit Profile
            </Link>
          </div>

          {/* ── Right: details ───────────────────────────── */}
          <div className="profile-details">

            {/* Domains */}
            <section className="profile-section glass-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>
                  <Globe size={18} /> My Domains
                </h2>
                {!showJoin && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleOpenJoin}
                  >
                    <Plus size={15} /> Join Domain
                  </button>
                )}
                {showJoin && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowJoin(false)}
                  >
                    <X size={15} /> Cancel
                  </button>
                )}
              </div>

              {/* Current domains list */}
              {!showJoin && (
                <>
                  {user.domains?.length > 0 ? (
                    <div className="profile-domain-tags">
                      {user.domains.map(d => (
                        <span key={d.id} className="domain-tag">
                          <span>{d.icon}</span> {d.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="profile-empty">
                      <p>No domains joined yet. Click "Join Domain" to get started!</p>
                    </div>
                  )}
                </>
              )}

              {/* Inline Join Domain panel */}
              {showJoin && (
                <div className="fade-in">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                    Select domains to join. New domains require approval from the domain lead or admin.
                    Domains you lead cannot be removed.
                  </p>

                  {fetchingDomains ? (
                    <div className="domain-grid-shimmer">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="shimmer" style={{ height: 96 }} />
                      ))}
                    </div>
                  ) : (
                    <DomainSelector
                      domains={allDomains}
                      selected={selected}
                      onChange={(newSelected) => {
                        const final = [...new Set([...newSelected, ...ledDomainIds])]
                        setSelected(final)
                      }}
                      disabled={savingDomains}
                    />
                  )}

                  {/* Pending request badges */}
                  {pendingRequests.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                        <Clock size={13} style={{ display: 'inline', marginRight: 4 }} />
                        Pending approval:
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {pendingRequests.map(r => (
                          <span key={r.id} className="domain-tag" style={{ opacity: 0.7 }}>
                            ⏳ {r.domain_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {domainError && (
                    <div className="alert alert-error" style={{ marginTop: 12 }}>⚠️ {domainError}</div>
                  )}
                  {domainSuccess && (
                    <div className="alert alert-success" style={{ marginTop: 12 }}>✅ Domain preferences saved!</div>
                  )}

                  <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveDomains}
                      disabled={savingDomains || domainSuccess}
                    >
                      {savingDomains ? <><span className="spin">⟳</span> Saving…</> : <><Save size={15} /> Save Selections</>}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setShowJoin(false)}
                      disabled={savingDomains}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Roles */}
            <section className="profile-section glass-card">
              <h2 className="section-title">
                <Shield size={18} /> Permissions
              </h2>
              <div className="profile-roles-list">
                {user.roles?.length > 0
                  ? user.roles.map(r => (
                    <div key={r} className="profile-role-row">
                      <RoleBadge roles={[r]} size="md" />
                      <span className="profile-role-desc">
                        {r === 'admin'
                          ? 'Full system access — can manage users and roles'
                          : r === 'domain_lead'
                            ? 'Domain leadership — can manage domain members'
                            : 'Standard club member access'}
                      </span>
                    </div>
                  ))
                  : <p style={{ color: 'var(--text-muted)' }}>No roles assigned.</p>
                }
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  )
}
