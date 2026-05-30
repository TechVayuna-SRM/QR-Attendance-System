import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  Users, UserPlus, Trash2, CheckCircle, XCircle, Crown, Clock, BarChart2
} from 'lucide-react'
import './DomainDashboardPage.css'

export default function DomainDashboardPage() {
  const { domainId } = useParams()
  const { user: currentUser, hasRole } = useAuth()
  const location = useLocation()

  const [domain,   setDomain]   = useState(null)
  const [members,  setMembers]  = useState([])
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [addRegNo, setAddRegNo] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  
  const queryParams = new URLSearchParams(location.search)
  const [tab, setTab] = useState(queryParams.get('tab') || 'members')

  useEffect(() => {
    const t = new URLSearchParams(location.search).get('tab')
    if (t && ['members', 'requests', 'attendance'].includes(t)) {
      setTab(t)
    }
  }, [location.search])

  // Attendance tab state
  const [attUsers,   setAttUsers]   = useState([])
  const [attLoading, setAttLoading] = useState(false)
  const [expanded,   setExpanded]   = useState(null)
  const [attFilters, setAttFilters] = useState({ start_date: '', end_date: '', month: '', year: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get(`/domain-dashboard/${domainId}`)
      setDomain(data.domain)
      setMembers(data.members)
      setRequests(data.requests)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard.')
    } finally {
      setLoading(false)
    }
  }, [domainId])

  const fetchAttendance = useCallback(async (filters = {}) => {
    setAttLoading(true)
    try {
      const params = { domain_id: domainId, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) }
      const res = await api.get('/analytics/all-users-attendance', { params })
      // filter to only members of this domain
      const memberIds = new Set(members.map(m => m.id))
      setAttUsers(res.data.filter(u => memberIds.has(u.id)))
    } catch { setAttUsers([]) }
    finally { setAttLoading(false) }
  }, [domainId, members])

  const handleDeleteAttendance = async (attendanceId, userName, date) => {
    if (!window.confirm(`Are you sure you want to remove attendance for ${userName} on ${date}?`)) return
    try {
      await api.delete(`/admin/attendance/${attendanceId}`)
      alert('Attendance record removed successfully.')
      fetchAttendance(attFilters)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove attendance.')
    }
  }

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (tab === 'attendance' && members.length > 0) fetchAttendance(attFilters)
  }, [tab, members])

  const handleAddMember = async (e) => {
    e.preventDefault()
    if (!addRegNo.trim()) return
    setAddLoading(true)
    setAddError('')
    try {
      await api.post(`/domain-dashboard/${domainId}/members`, { registration_number: addRegNo.trim() })
      setAddRegNo('')
      fetchData()
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add member.')
    } finally {
      setAddLoading(false)
    }
  }

  const handleRemoveMember = async (memberId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from this domain?`)) return
    try {
      await api.delete(`/domain-dashboard/${domainId}/members/${memberId}`)
      fetchData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove member.')
    }
  }

  const handleAccept = async (reqId) => {
    try {
      await api.post(`/domain-dashboard/${domainId}/requests/${reqId}/accept`)
      fetchData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to accept request.')
    }
  }

  const handleReject = async (reqId) => {
    if (!window.confirm('Reject this join request?')) return
    try {
      await api.post(`/domain-dashboard/${domainId}/requests/${reqId}/reject`)
      fetchData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject request.')
    }
  }

  if (loading) return <div className="page-wrapper"><LoadingSpinner label="Loading dashboard…" /></div>

  if (error) return (
    <div className="page-wrapper">
      <div className="container">
        <div className="alert alert-error" style={{ marginTop: '2rem' }}>⚠️ {error}</div>
        <Link to={hasRole('admin') ? '/admin' : '/profile'} className="btn btn-ghost btn-sm" style={{ marginTop: 16 }}>
          ← Back
        </Link>
      </div>
    </div>
  )

  return (
    <div className="domain-dash-page page-wrapper">
      <div className="container fade-in">

        {/* Header */}
        <div className="dd-header">
          <div className="dd-header-left">
            <Link to={hasRole('admin') ? '/admin' : '/profile'} className="btn btn-ghost btn-sm dd-back">
              ← Back
            </Link>
            <div className="dd-title-block">
              <span className="dd-icon">{domain?.icon}</span>
              <div>
                <h1>{domain?.name}</h1>
                {domain?.description && <p className="dd-desc">{domain.description}</p>}
              </div>
            </div>
          </div>
          <div className="dd-lead-chip">
            <Crown size={14} />
            Lead: <strong>{domain?.lead_name || 'Unassigned'}</strong>
          </div>
        </div>

        {/* Stats row */}
        <div className="dd-stats-row">
          <div className="glass-card dd-stat">
            <Users size={20} />
            <div>
              <span className="dd-stat-num">{members.length}</span>
              <span className="dd-stat-label">Members</span>
            </div>
          </div>
          <div className="glass-card dd-stat">
            <Clock size={20} />
            <div>
              <span className="dd-stat-num">{requests.length}</span>
              <span className="dd-stat-label">Pending Requests</span>
            </div>
          </div>
        </div>

        {/* Add Member form */}
        <div className="glass-card dd-add-form-card">
          <h3><UserPlus size={16} /> Add Member by Registration Number</h3>
          <form onSubmit={handleAddMember} className="dd-add-form">
            <input
              type="text"
              className="input-field"
              placeholder="e.g. RAXXXXXXXXXXXXX"
              value={addRegNo}
              onChange={e => setAddRegNo(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={addLoading}>
              {addLoading ? 'Adding…' : 'Add'}
            </button>
          </form>
          {addError && <div className="alert alert-error" style={{ marginTop: 8 }}>⚠️ {addError}</div>}
        </div>

        {/* Tabs */}
        <div className="dd-tabs">
          <button className={`dd-tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>
            <Users size={15} /> Members ({members.length})
          </button>
          <button className={`dd-tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>
            <Clock size={15} /> Join Requests
            {requests.length > 0 && <span className="dd-badge">{requests.length}</span>}
          </button>
          <button className={`dd-tab ${tab === 'attendance' ? 'active' : ''}`} onClick={() => setTab('attendance')}>
            <BarChart2 size={15} /> Attendance
          </button>
        </div>

        {/* Members Tab */}
        {tab === 'members' && (
          <div className="glass-card dd-table-card">
            <table className="dd-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Registration No</th>
                  <th className="align-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr><td colSpan={3} className="dd-empty-row">No members yet.</td></tr>
                ) : (
                  members.map(m => (
                    <tr key={m.id} className={m.id === domain?.lead_id ? 'dd-lead-row' : ''}>
                      <td>
                        <div className="dd-member-cell">
                          {m.avatar_url
                            ? <img src={m.avatar_url} alt="" className="dd-avatar" />
                            : <div className="dd-avatar placeholder">{m.name.charAt(0).toUpperCase()}</div>
                          }
                          <span className="dd-member-name">{m.name}</span>
                          {m.id === domain?.lead_id && (
                            <span className="dd-lead-badge"><Crown size={11} /> Lead</span>
                          )}
                          {m.id === currentUser?.id && (
                            <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>You</span>
                          )}
                        </div>
                      </td>
                      <td><span className="dd-email">{m.registration_number || 'N/A'}</span></td>
                      <td className="align-right">
                        <button
                          className="btn btn-ghost btn-sm dd-remove-btn"
                          onClick={() => handleRemoveMember(m.id, m.name)}
                          disabled={m.id === domain?.lead_id}
                          title={m.id === domain?.lead_id ? 'Cannot remove the domain lead' : 'Remove member'}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Requests Tab */}
        {tab === 'requests' && (
          <div className="glass-card dd-table-card">
            {requests.length === 0 ? (
              <div className="dd-no-requests">
                <CheckCircle size={40} className="dd-no-req-icon" />
                <p>No pending join requests.</p>
              </div>
            ) : (
              <table className="dd-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Registration No</th>
                    <th>Requested</th>
                    <th className="align-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id}>
                      <td>
                        <div className="dd-member-cell">
                          <div className="dd-avatar placeholder">{r.user_name?.charAt(0).toUpperCase()}</div>
                          <span className="dd-member-name">{r.user_name}</span>
                        </div>
                      </td>
                      <td><span className="dd-email">{r.user_registration_number || 'N/A'}</span></td>
                      <td>
                        <span className="dd-email">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="align-right">
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleAccept(r.id)}
                            title="Accept"
                          >
                            <CheckCircle size={14} /> Accept
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleReject(r.id)}
                            title="Reject"
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Attendance Tab */}
        {tab === 'attendance' && (
          <div className="glass-card dd-table-card">
            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <input type="date" className="input-field" style={{ flex: 1, minWidth: 140 }}
                value={attFilters.start_date} placeholder="From"
                onChange={e => setAttFilters(f => ({ ...f, start_date: e.target.value }))} />
              <input type="date" className="input-field" style={{ flex: 1, minWidth: 140 }}
                value={attFilters.end_date} placeholder="To"
                onChange={e => setAttFilters(f => ({ ...f, end_date: e.target.value }))} />
              <input type="number" className="input-field" style={{ width: 110 }}
                placeholder="Month (1-12)" min="1" max="12"
                value={attFilters.month}
                onChange={e => setAttFilters(f => ({ ...f, month: e.target.value }))} />
              <input type="number" className="input-field" style={{ width: 100 }}
                placeholder="Year"
                value={attFilters.year}
                onChange={e => setAttFilters(f => ({ ...f, year: e.target.value }))} />
              <button className="btn btn-primary btn-sm" onClick={() => fetchAttendance(attFilters)}>Apply</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setAttFilters({ start_date: '', end_date: '', month: '', year: '' }); fetchAttendance({}) }}>Reset</button>
            </div>

            {attLoading ? <LoadingSpinner label="Loading attendance…" /> : (
              <table className="dd-table">
                <thead>
                  <tr>
                    {['Name', 'Regno', 'Present', 'Absent', '%', 'Details'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {attUsers.length === 0 && (
                    <tr><td colSpan={6} className="dd-empty-row">No attendance records found.</td></tr>
                  )}
                  {attUsers.map(u => (
                    <>
                      <tr key={u.id}>
                        <td><span className="dd-member-name">{u.name}</span></td>
                        <td><span className="dd-email">{u.regno}</span></td>
                        <td style={{ color: '#4ade80', fontWeight: 700 }}>{u.present}</td>
                        <td style={{ color: '#f87171', fontWeight: 700 }}>{u.absent}</td>
                        <td>{u.percentage}%</td>
                        <td>
                          {u.total > 0 && (
                            <button className="btn btn-ghost btn-sm"
                              onClick={() => setExpanded(expanded === u.id ? null : u.id)}>
                              {expanded === u.id ? '▲ Hide' : '▼ View'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded === u.id && (
                        <tr key={`exp-${u.id}`}>
                          <td colSpan={6} style={{ padding: '0 12px 12px', background: '#0d1117' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                              <thead>
                                <tr>{['Date', 'Status', 'Marked At', hasRole('admin', 'faculty', 'domain_lead') ? 'Action' : ''].filter(Boolean).map(h => <th key={h} style={{ padding: '6px 10px', background: '#1e3a8a', color: '#93c5fd', fontSize: 11, textAlign: 'left' }}>{h}</th>)}</tr>
                              </thead>
                              <tbody>
                                {u.records.map((r, j) => (
                                  <tr key={j}>
                                    <td style={{ padding: '6px 10px', fontSize: 13, color: '#d1d5db' }}>{r.date}</td>
                                    <td style={{ padding: '6px 10px', fontSize: 13, fontWeight: 700, color: r.status === 'present' ? '#4ade80' : '#f87171' }}>{r.status}</td>
                                    <td style={{ padding: '6px 10px', fontSize: 13, color: '#6b7280' }}>{r.marked_at || '—'}</td>
                                    {hasRole('admin', 'faculty', 'domain_lead') && (
                                      <td style={{ padding: '6px 10px', fontSize: 13 }}>
                                        {r.status === 'present' && (
                                          <button
                                            onClick={() => handleDeleteAttendance(r.id, u.name, r.date)}
                                            style={{
                                              background: '#ef4444',
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
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
