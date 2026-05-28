import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  Users, UserPlus, Trash2, CheckCircle, XCircle, Crown, Clock
} from 'lucide-react'
import './DomainDashboardPage.css'

export default function DomainDashboardPage() {
  const { domainId } = useParams()
  const { user: currentUser, hasRole } = useAuth()

  const [domain,   setDomain]   = useState(null)
  const [members,  setMembers]  = useState([])
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [addRegNo, setAddRegNo] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [tab, setTab] = useState('members') // 'members' | 'requests'

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

  useEffect(() => { fetchData() }, [fetchData])

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
          <button
            className={`dd-tab ${tab === 'members' ? 'active' : ''}`}
            onClick={() => setTab('members')}
          >
            <Users size={15} /> Members ({members.length})
          </button>
          <button
            className={`dd-tab ${tab === 'requests' ? 'active' : ''}`}
            onClick={() => setTab('requests')}
          >
            <Clock size={15} /> Join Requests
            {requests.length > 0 && <span className="dd-badge">{requests.length}</span>}
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

      </div>
    </div>
  )
}
