import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import RoleBadge from '../components/RoleBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  Users, Globe, BarChart3, Search, ChevronLeft, ChevronRight,
  ShieldCheck, UserX, Plus, Trash2, UserCheck, CheckCircle
} from 'lucide-react'
import './AdminPage.css'

export default function AdminPage() {
  const { user: currentUser } = useAuth()
  const [tab, setTab] = useState('overview')

  return (
    <div className="admin-page page-wrapper">
      <div className="container">
        <div className="admin-header fade-in">
          <div>
            <h1>⚡ Admin Dashboard</h1>
            <p>Manage users, roles, and domains across the system.</p>
          </div>
          <div className="admin-info-chip">
            Logged in as <strong>{currentUser?.name}</strong>
          </div>
        </div>

        {/* Tab bar */}
        <div className="admin-tabs fade-in">
          {[
            { key: 'overview', icon: <BarChart3 size={16} />, label: 'Overview' },
            { key: 'approvals', icon: <CheckCircle size={16} />, label: 'Pending Approvals' },
            { key: 'users', icon: <Users size={16} />, label: 'Users' },
            { key: 'domains', icon: <Globe size={16} />, label: 'Domains' },
          ].map(t => (
            <button
              key={t.key}
              id={`admin-tab-${t.key}`}
              className={`admin-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Panels */}
        <div className="fade-in">
          {tab === 'overview' && <OverviewPanel />}
          {tab === 'approvals' && <ApprovalsPanel />}
          {tab === 'users' && <UsersPanel />}
          {tab === 'domains' && <DomainsPanel />}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Overview Panel — stats cards + top domains
───────────────────────────────────────────────────────────────────────────── */
function OverviewPanel() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/stats')
      .then(r => setStats(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner label="Loading stats…" />

  const statCards = [
    { label: 'Total Users', value: stats.total_users, icon: '👥', color: 'primary' },
    { label: 'Verified', value: stats.verified_users, icon: '✅', color: 'success' },
    { label: 'Active Accounts', value: stats.active_users, icon: '🟢', color: 'success' },
    { label: 'Face Registered', value: stats.face_registrations, icon: '🔒', color: 'cyan' },
  ]

  return (
    <div className="overview-panel">
      {/* Stat cards */}
      <div className="stats-grid">
        {statCards.map(s => (
          <div key={s.label} className={`stat-card glass-card stat-${s.color}`}>
            <span className="stat-icon">{s.icon}</span>
            <div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Role distribution */}
      <div className="overview-bottom">
        <div className="glass-card overview-card">
          <h3 className="section-title">🏷️ Role Distribution</h3>
          <div className="role-dist">
            {Object.entries(stats.role_distribution).map(([role, count]) => {
              const pct = stats.total_users ? Math.round((count / stats.total_users) * 100) : 0
              return (
                <div key={role} className="role-dist-row">
                  <RoleBadge roles={[role]} />
                  <div className="role-dist-bar-wrap">
                    <div className="role-dist-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="role-dist-count">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="glass-card overview-card">
          <h3 className="section-title">🌐 Top Domains</h3>
          <div className="top-domains-list">
            {stats.top_domains.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>No domain data yet.</p>
            )}
            {stats.top_domains.map((d, i) => (
              <div key={d.domain} className="top-domain-row">
                <span className="top-domain-rank">#{i + 1}</span>
                <span className="top-domain-icon">{d.icon}</span>
                <span className="top-domain-name">{d.domain}</span>
                <span className="top-domain-count">{d.user_count} members</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Users Panel — searchable paginated table with role/active controls
───────────────────────────────────────────────────────────────────────────── */
function UsersPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/users', {
        params: { page, per_page: 15, search: debouncedSearch }
      })
      setUsers(data.users)
      setTotalPages(data.pages)
      setTotal(data.total)
    } catch { /* error handled by axios interceptor */ }
    finally { setLoading(false) }
  }, [page, debouncedSearch])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useEffect(() => { setPage(1) }, [debouncedSearch])

  const makeAdmin = async (u) => {
    if (!window.confirm(`Grant Admin role to ${u.name}?`)) return
    try {
      await api.post(`/admin/users/${u.id}/role`, { role: 'admin', action: 'add' })
      fetchUsers()
    } catch (e) { alert(e.response?.data?.error || 'Failed to grant admin') }
  }

  const deleteUser = async (u) => {
    if (!window.confirm(`Permanently delete account for ${u.name}? This cannot be undone.`)) return
    try {
      await api.delete(`/admin/users/${u.id}`)
      fetchUsers()
    } catch (e) { alert(e.response?.data?.error || 'Failed to delete user') }
  }

  return (
    <div className="users-panel">
      {/* Search bar */}
      <div className="users-toolbar glass-card">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input
            id="user-search-input"
            className="search-input"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="users-count">{total} users</span>
      </div>

      {/* Table */}
      <div className="glass-card table-wrap">
        {loading ? (
          <LoadingSpinner label="Loading users…" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Reg No</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                    No users found.
                  </td>
                </tr>
              )}
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="user-avatar-sm" />
                        : <div className="user-avatar-sm placeholder">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                      }
                      <span className="user-name-cell">{u.name}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{u.registration_number || 'N/A'}</td>
                  <td><RoleBadge roles={u.roles} size="sm" /></td>
                  <td>
                    <span className={`badge ${u.is_verified ? 'badge-verified' : 'badge-unverified'}`}>
                      {u.is_verified ? '✅ Verified' : '⏳ Pending'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="action-btns">
                      {!u.roles.includes('admin') && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => makeAdmin(u)}
                          title="Make Admin"
                        >
                          <ShieldCheck size={14} /> Admin
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteUser(u)}
                        title="Remove Account completely"
                      >
                        <UserX size={14} /> Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="page-info">Page {page} of {totalPages}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Domains Panel — list + create form
───────────────────────────────────────────────────────────────────────────── */
function DomainsPanel() {
  const [domains, setDomains] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', icon: '🔧' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchDomains = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/domains')
      setDomains(data.domains)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchDomains() }, [fetchDomains])

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/admin/domains', form)
      setForm({ name: '', description: '', icon: '🔧' })
      setShowForm(false)
      fetchDomains()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create domain.')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete domain "${name}"?`)) return
    try {
      await api.delete(`/admin/domains/${id}`)
      fetchDomains()
    } catch { /* handled */ }
  }

  const handleSetLead = async (id, currentLead) => {
    const regNo = window.prompt(`Enter exact Registration Number of the new lead for this domain.\nLeave blank to remove current lead (${currentLead || 'None'}):`)
    if (regNo === null) return // cancelled
    try {
      await api.post(`/admin/domains/${id}/lead`, { registration_number: regNo.trim() })
      fetchDomains()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update domain lead.')
    }
  }

  return (
    <div className="domains-panel">
      <div className="domains-toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>🌐 All Domains ({domains.length})</h2>
        <button
          id="add-domain-btn"
          className="btn btn-primary btn-sm"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={15} /> New Domain
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="glass-card domain-form fade-in">
          <h3>Create Domain</h3>
          <form onSubmit={handleCreate} id="create-domain-form">
            <div className="domain-form-grid">
              <div className="input-group">
                <label className="input-label">Icon (emoji)</label>
                <input className="input-field" value={form.icon}
                  onChange={e => setForm({ ...form, icon: e.target.value })} maxLength={4} />
              </div>
              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label className="input-label">Name *</label>
                <input className="input-field" value={form.name} required
                  onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Web Development" />
              </div>
              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label className="input-label">Description</label>
                <input className="input-field" value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            {error && <div className="alert alert-error">⚠️ {error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? 'Creating…' : 'Create Domain'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Domain grid */}
      {loading ? <LoadingSpinner label="Loading domains…" /> : (
        <div className="domains-grid">
          {domains.map(d => (
            <div key={d.id} className="domain-admin-card glass-card">
              <span className="domain-admin-icon">{d.icon}</span>
              <div className="domain-admin-info" style={{ flex: 1 }}>
                <strong>{d.name}</strong>
                {d.description && <p>{d.description}</p>}
                <div style={{ fontSize: '0.8rem', marginTop: 4, color: 'var(--primary)' }}>
                  Lead: {d.lead_name || 'None'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Link
                  className="btn btn-primary btn-sm"
                  to={`/domain/${d.id}/dashboard`}
                  title="View Dashboard"
                  style={{ textDecoration: 'none', textAlign: 'center' }}
                >
                  Dashboard
                </Link>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSetLead(d.id, d.lead_name)}
                  title="Set Lead via Registration Number"
                >
                  <UserCheck size={14} />
                </button>
                <button
                  id={`delete-domain-${d.id}`}
                  className="btn btn-danger btn-sm domain-delete-btn"
                  onClick={() => handleDelete(d.id, d.name)}
                  title="Delete domain"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Approvals Panel — view and approve pending users
───────────────────────────────────────────────────────────────────────────── */
function ApprovalsPanel() {
  const [pendingUsers, setPendingUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/pending-approvals')
      setPendingUsers(data.users)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  const handleApprove = async (u) => {
    if (!window.confirm(`Approve account for ${u.name} (${u.registration_number})?`)) return
    try {
      await api.post(`/admin/users/${u.id}/approve`)
      fetchPending()
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to approve user')
    }
  }

  return (
    <div className="users-panel">
      <div className="users-toolbar glass-card">
        <h2 className="section-title" style={{ margin: 0 }}>Pending Approvals ({pendingUsers.length})</h2>
      </div>

      <div className="glass-card table-wrap">
        {loading ? (
          <LoadingSpinner label="Loading pending users…" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Registration No</th>
                <th>Year</th>
                <th>Department</th>
                <th>Section</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                    No pending approvals.
                  </td>
                </tr>
              )}
              {pendingUsers.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="user-avatar-sm" />
                        : <div className="user-avatar-sm placeholder">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                      }
                      <span className="user-name-cell">{u.name}</span>
                    </div>
                  </td>
                  <td>{u.registration_number}</td>
                  <td>{u.year}</td>
                  <td>{u.department}</td>
                  <td>{u.section}</td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleApprove(u)}
                    >
                      <CheckCircle size={14} /> Approve
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
