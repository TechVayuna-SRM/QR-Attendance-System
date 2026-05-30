import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import RoleBadge from '../components/RoleBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  Users, Globe, BarChart3, Search, ChevronLeft, ChevronRight,
  ShieldCheck, UserX, Plus, Trash2, UserCheck, CheckCircle, Clock
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

        <div className="admin-tabs fade-in">
          {[
            { key: 'overview',        icon: <BarChart3 size={16} />,   label: 'Overview' },
            { key: 'approvals',       icon: <CheckCircle size={16} />, label: 'Pending Approvals' },
            { key: 'domain-requests', icon: <ShieldCheck size={16} />, label: 'Domain Requests' },
            { key: 'users',           icon: <Users size={16} />,       label: 'Users' },
            { key: 'domains',         icon: <Globe size={16} />,       label: 'Domains' },
            { key: 'analytics',       icon: <Clock size={16} />,       label: 'Attendance Records' },
          ].map(t => (
            <button
              key={t.key}
              className={`admin-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="fade-in">
          {tab === 'overview'        && <OverviewPanel />}
          {tab === 'approvals'       && <ApprovalsPanel />}
          {tab === 'domain-requests' && <DomainRequestsPanel />}
          {tab === 'users'           && <UsersPanel />}
          {tab === 'domains'         && <DomainsPanel />}
          {tab === 'analytics'       && <DataAnalyticsPanel />}
        </div>
      </div>
    </div>
  )
}

function OverviewPanel() {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/stats')
      .then(r => setStats(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner label="Loading stats…" />

  const statCards = [
    { label: 'Total Users',     value: stats.total_users,        icon: '👥', color: 'primary' },
    { label: 'Verified',        value: stats.verified_users,     icon: '✅', color: 'success' },
    { label: 'Active Accounts', value: stats.active_users,       icon: '🟢', color: 'success' },
    { label: 'Face Registered', value: stats.face_registrations, icon: '🔒', color: 'cyan' },
  ]

  return (
    <div className="overview-panel">
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
            {stats.top_domains.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No domain data yet.</p>}
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

function UsersPanel() {
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage]             = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal]           = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/users', { params: { page, per_page: 15, search: debouncedSearch } })
      setUsers(data.users)
      setTotalPages(data.pages)
      setTotal(data.total)
    } catch { /* handled */ }
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
      <div className="users-toolbar glass-card">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input
            className="search-input"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="users-count">{total} users</span>
      </div>

      <div className="glass-card table-wrap">
        {loading ? <LoadingSpinner label="Loading users…" /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th><th>Reg No</th><th>Roles</th><th>Status</th><th>Joined</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No users found.</td></tr>
              )}
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="user-avatar-sm" />
                        : <div className="user-avatar-sm placeholder">{u.name.charAt(0).toUpperCase()}</div>
                      }
                      <span className="user-name-cell">{u.name}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{u.registration_number || 'N/A'}</td>
                  <td><RoleBadge roles={u.roles || (u.role ? [u.role] : [])} size="sm" /></td>
                  <td>
                    <span className={`badge ${u.is_verified ? 'badge-verified' : 'badge-unverified'}`}>
                      {u.is_verified ? '✅ Verified' : '⏳ Pending'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <div className="action-btns">
                      {!(u.roles || []).includes('admin') && (
                        <button className="btn btn-secondary btn-sm" onClick={() => makeAdmin(u)} title="Make Admin">
                          <ShieldCheck size={14} /> Admin
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u)} title="Remove Account">
                        <UserX size={14} /> Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="page-info">Page {page} of {totalPages}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function DomainsPanel() {
  const [domains, setDomains]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ name: '', description: '', icon: '🔧' })
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

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
    try { await api.delete(`/admin/domains/${id}`); fetchDomains() } catch { /* handled */ }
  }

  const handleSetLead = async (id, currentLead) => {
    const regNo = window.prompt(`Enter Registration Number of the new lead.\nLeave blank to remove current lead (${currentLead || 'None'}):`)
    if (regNo === null) return
    try {
      await api.post(`/admin/domains/${id}/lead`, { registration_number: regNo.trim() })
      fetchDomains()
    } catch (err) { alert(err.response?.data?.error || 'Failed to update domain lead.') }
  }

  return (
    <div className="domains-panel">
      <div className="domains-toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>🌐 All Domains ({domains.length})</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={15} /> New Domain
        </button>
      </div>

      {showForm && (
        <div className="glass-card domain-form fade-in">
          <h3>Create Domain</h3>
          <form onSubmit={handleCreate}>
            <div className="domain-form-grid">
              <div className="input-group">
                <label className="input-label">Icon (emoji)</label>
                <input className="input-field" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} maxLength={4} />
              </div>
              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label className="input-label">Name *</label>
                <input className="input-field" value={form.name} required onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Web Development" />
              </div>
              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label className="input-label">Description</label>
                <input className="input-field" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            {error && <div className="alert alert-error">⚠️ {error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Creating…' : 'Create Domain'}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <LoadingSpinner label="Loading domains…" /> : (
        <div className="domains-grid">
          {domains.map(d => (
            <div key={d.id} className="domain-admin-card glass-card">
              <span className="domain-admin-icon">{d.icon}</span>
              <div className="domain-admin-info" style={{ flex: 1 }}>
                <strong>{d.name}</strong>
                {d.description && <p>{d.description}</p>}
                <div style={{ fontSize: '0.8rem', marginTop: 4, color: 'var(--primary)' }}>Lead: {d.lead_name || 'None'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Link className="btn btn-primary btn-sm" to={`/domain/${d.id}/dashboard`} style={{ textDecoration: 'none', textAlign: 'center' }}>Dashboard</Link>
                {d.pending_count > 0 && (
                  <Link className="btn btn-danger btn-sm" to={`/domain/${d.id}/dashboard?tab=requests`} style={{ textDecoration: 'none', textAlign: 'center', fontWeight: 'bold' }}>
                    Join Requests ({d.pending_count})
                  </Link>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => handleSetLead(d.id, d.lead_name)} title="Set Lead"><UserCheck size={14} /></button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d.id, d.name)} title="Delete domain"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DataAnalyticsPanel() {
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState({ start_date: '', end_date: '', month: '', year: '' })
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)

  const ROLE_COLOR = { admin: '#e63946', domain_lead: '#457b9d', member: '#2a9d8f', faculty: '#9c27b0', president: '#f4a261', vice_president: '#2ec4b6' }
  const ROLE_LABEL = { admin: 'Admin', domain_lead: 'Domain Lead', member: 'Member', faculty: 'Faculty', president: 'President', vice_president: 'Vice President' }

  const fetchData = async (params = {}) => {
    setLoading(true)
    try {
      const res = await api.get('/analytics/all-users-attendance', { params })
      setUsers(res.data)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }

  const handleDeleteAttendance = async (attendanceId, userName, date) => {
    if (!window.confirm(`Are you sure you want to remove attendance for ${userName} on ${date}?`)) return
    try {
      await api.delete(`/admin/attendance/${attendanceId}`)
      alert('Attendance record removed successfully.')
      const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      fetchData(active)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove attendance.')
    }
  }

  useEffect(() => { fetchData() }, [])

  const applyFilters = () => {
    const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    fetchData(active)
  }

  const resetFilters = () => {
    setFilters({ start_date: '', end_date: '', month: '', year: '' })
    setRoleFilter('')
    fetchData()
  }

  const downloadReport = async (fmt) => {
    try {
      const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      const qs = new URLSearchParams({ ...active, format: fmt }).toString()
      const res = await fetch(`http://localhost:5001/api/analytics/report?${qs}`, { credentials: 'include' })
      if (!res.ok) { alert('Failed to download report.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `attendance_report.${fmt}`; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Download failed.') }
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.regno || '').toLowerCase().includes(q)
    return matchSearch && (roleFilter ? u.role === roleFilter : true)
  })

  const totalPresent = filtered.reduce((s, u) => s + u.present, 0)
  const totalRecords = filtered.reduce((s, u) => s + u.total, 0)
  const overallPct   = totalRecords ? ((totalPresent / totalRecords) * 100).toFixed(1) : 0

  const inp = { padding: '8px 10px', borderRadius: 8, border: '1px solid #374151', fontSize: 13, background: '#1f2937', color: '#f9fafb', outline: 'none' }
  const btn = { background: 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }

  return (
    <div>
      {/* Filters */}
      <div style={{ background: '#111827', padding: '16px 20px', borderRadius: 12, border: '1px solid #1f2937', marginBottom: 16 }}>
        <p style={{ fontWeight: 700, marginBottom: 10, color: '#d1d5db' }}>🔍 Filters</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={inp} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value=''>All Roles</option>
            {['admin','domain_lead','member','faculty','president','vice_president'].map(r => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
          </select>
          <input style={inp} type='number' placeholder='Month (1-12)' min='1' max='12' value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))} />
          <input style={inp} type='number' placeholder='Year' value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))} />
          <input style={inp} type='date' value={filters.start_date} onChange={e => setFilters(f => ({ ...f, start_date: e.target.value }))} />
          <input style={inp} type='date' value={filters.end_date} onChange={e => setFilters(f => ({ ...f, end_date: e.target.value }))} />
          <button style={btn} onClick={applyFilters}>Apply</button>
          <button style={{ ...btn, background: '#888' }} onClick={resetFilters}>Reset</button>
        </div>
      </div>

      {/* Search */}
      <input style={{ ...inp, width: '100%', marginBottom: 16, boxSizing: 'border-box' }}
        placeholder='🔍 Search by name, email or regno...'
        value={search} onChange={e => setSearch(e.target.value)} />

      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {[['Total Users', filtered.length, '#1a1a2e'], ['Total Records', totalRecords, '#457b9d'], ['Present', totalPresent, '#2a9d8f'], ['Absent', totalRecords - totalPresent, '#e63946'], ['Overall %', `${overallPct}%`, '#f4a261']].map(([label, value, color]) => (
          <div key={label} style={{ background: color, color: '#fff', padding: '14px 20px', borderRadius: 10, textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Download */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
        <button style={btn} onClick={() => downloadReport('xlsx')}>⬇ Excel (.xlsx)</button>
        <button style={{ ...btn, background: '#e63946' }} onClick={() => downloadReport('pdf')}>⬇ PDF</button>
      </div>

      {/* Table */}
      {loading ? <LoadingSpinner label='Loading...' /> : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #1f2937' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#111827' }}>
            <thead>
              <tr>{['Name','Regno','Email','Dept','Year','Role','Present','Absent','%','Details'].map(h => (
                <th key={h} style={{ background: '#0d1117', color: '#9ca3af', padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>No users found</td></tr>}
              {filtered.map(u => (
                <>
                  <tr key={u.id} style={{ borderBottom: '1px solid #1f2937' }}>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#d1d5db' }}>{u.name}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#d1d5db' }}>{u.regno}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#d1d5db' }}>{u.email}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#d1d5db' }}>{u.department}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#d1d5db' }}>{u.year}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: ROLE_COLOR[u.role] || '#888', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>{ROLE_LABEL[u.role] || u.role}</span>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#2a9d8f', fontWeight: 700 }}>{u.present}</td>
                    <td style={{ padding: '12px 14px', color: '#e63946', fontWeight: 700 }}>{u.absent}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#d1d5db' }}>{u.percentage}%</td>
                    <td style={{ padding: '12px 14px' }}>
                      {u.total > 0 && <button style={{ background: '#1e3a8a', color: '#93c5fd', border: '1px solid #1e40af', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => setExpanded(expanded === u.id ? null : u.id)}>{expanded === u.id ? '▲ Hide' : '▼ View'}</button>}
                    </td>
                  </tr>
                  {expanded === u.id && (
                    <tr key={`exp-${u.id}`}>
                      <td colSpan={10} style={{ padding: '0 16px 12px', background: '#0d1117' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                          <thead><tr>{['Date','Domain','Status','Marked At', 'Action'].map(h => <th key={h} style={{ background: '#1e3a8a', color: '#93c5fd', padding: '6px 10px', fontSize: 11, textAlign: 'left' }}>{h}</th>)}</tr></thead>
                          <tbody>{u.records.map((r, j) => (
                            <tr key={j}>
                              <td style={{ padding: '6px 10px', fontSize: 13, color: '#d1d5db' }}>{r.date}</td>
                              <td style={{ padding: '6px 10px', fontSize: 13, color: '#d1d5db' }}>{r.domain}</td>
                              <td style={{ padding: '6px 10px', fontSize: 13, fontWeight: 700, color: r.status === 'present' ? '#2a9d8f' : '#e63946' }}>{r.status}</td>
                              <td style={{ padding: '6px 10px', fontSize: 13, color: '#6b7280' }}>{r.marked_at || '—'}</td>
                              <td style={{ padding: '6px 10px', fontSize: 13 }}>
                                {r.status === 'present' && (
                                  <button
                                    onClick={() => handleDeleteAttendance(r.id, u.name, r.date)}
                                    style={{
                                      background: '#e63946',
                                      color: '#ffffff',
                                      border: 'none',
                                      padding: '4px 10px',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      fontWeight: '600'
                                    }}
                                  >
                                    Remove
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DomainRequestsPanel() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/domain-requests')
      setRequests(data.requests)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const handleApprove = async (req) => {
    try {
      await api.post(`/admin/domain-requests/${req.id}/approve`)
      fetchRequests()
    } catch (e) { alert(e.response?.data?.error || 'Failed to approve') }
  }

  const handleReject = async (req) => {
    if (!window.confirm(`Reject ${req.user_name}'s request to join ${req.domain_name}?`)) return
    try {
      await api.post(`/admin/domain-requests/${req.id}/reject`)
      fetchRequests()
    } catch (e) { alert(e.response?.data?.error || 'Failed to reject') }
  }

  return (
    <div className="users-panel">
      <div className="users-toolbar glass-card">
        <h2 className="section-title" style={{ margin: 0 }}>🌐 Domain Join Requests ({requests.length})</h2>
      </div>
      <div className="glass-card table-wrap">
        {loading ? <LoadingSpinner label="Loading requests…" /> : (
          <table className="data-table">
            <thead>
              <tr><th>User</th><th>Reg No</th><th>Domain</th><th>Requested At</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No pending domain requests.</td></tr>
              )}
              {requests.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar-sm placeholder">{r.user_name.charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="user-name-cell">{r.user_name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{r.registration_number || 'N/A'}</td>
                  <td><span className="badge badge-domain_lead">{r.domain_name}</span></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="action-btns">
                      <button className="btn btn-primary btn-sm" onClick={() => handleApprove(r)}>
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleReject(r)}>
                        <UserX size={14} /> Reject
                      </button>
                    </div>
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

function ApprovalsPanel() {
  const [pendingUsers, setPendingUsers] = useState([])
  const [loading, setLoading]           = useState(true)

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
    } catch (e) { alert(e.response?.data?.error || 'Failed to approve user') }
  }

  return (
    <div className="users-panel">
      <div className="users-toolbar glass-card">
        <h2 className="section-title" style={{ margin: 0 }}>Pending Approvals ({pendingUsers.length})</h2>
      </div>
      <div className="glass-card table-wrap">
        {loading ? <LoadingSpinner label="Loading pending users…" /> : (
          <table className="data-table">
            <thead>
              <tr><th>User</th><th>Registration No</th><th>Year</th><th>Department</th><th>Section</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {pendingUsers.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No pending approvals.</td></tr>
              )}
              {pendingUsers.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="user-avatar-sm" />
                        : <div className="user-avatar-sm placeholder">{u.name.charAt(0).toUpperCase()}</div>
                      }
                      <span className="user-name-cell">{u.name}</span>
                    </div>
                  </td>
                  <td>{u.registration_number}</td>
                  <td>{u.year}</td>
                  <td>{u.department}</td>
                  <td>{u.section}</td>
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={() => handleApprove(u)}>
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
