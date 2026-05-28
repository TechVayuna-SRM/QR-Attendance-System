import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import LoadingSpinner from '../components/LoadingSpinner'
import { Globe, Users, Plus, Trash2, UserPlus } from 'lucide-react'
import './DomainLeadPage.css'

export default function DomainLeadPage() {
  const { user } = useAuth()
  const [domains, setDomains] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/domain-lead/dashboard')
      setDomains(data.domains || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const handleAddMember = async (domainId, e) => {
    e.preventDefault()
    const form = e.target
    const regNoInput = form.elements['registration_number']
    const registration_number = regNoInput.value.trim()
    if (!registration_number) return

    try {
      await api.post(`/domain-lead/domains/${domainId}/members`, { registration_number })
      regNoInput.value = ''
      fetchDashboard()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add member.')
    }
  }

  const handleRemoveMember = async (domainId, memberId, memberName) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName} from this domain?`)) return
    
    try {
      await api.delete(`/domain-lead/domains/${domainId}/members/${memberId}`)
      fetchDashboard()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove member.')
    }
  }

  if (loading) {
    return (
      <div className="page-wrapper">
        <LoadingSpinner label="Loading dashboard…" />
      </div>
    )
  }

  return (
    <div className="domain-lead-page page-wrapper">
      <div className="container fade-in">
        <div className="dl-header">
          <div>
            <h1>Domain Lead Dashboard</h1>
            <p>Manage members for the domains you lead.</p>
          </div>
        </div>

        {error && <div className="alert alert-error">⚠️ {error}</div>}

        {domains.length === 0 ? (
          <div className="glass-card dl-empty fade-in">
            <Globe className="dl-empty-icon" size={48} />
            <h2>No Domains Assigned</h2>
            <p>You are not currently assigned as a lead for any domains.</p>
          </div>
        ) : (
          <div className="dl-domains-list">
            {domains.map(d => (
              <div key={d.id} className="glass-card dl-domain-card">
                <div className="dl-domain-header">
                  <div className="dl-domain-title">
                    <span className="dl-domain-icon">{d.icon}</span>
                    <h2>{d.name}</h2>
                  </div>
                  <span className="dl-member-count">
                    <Users size={16} /> {d.members?.length || 0} Members
                  </span>
                </div>
                
                <form onSubmit={(e) => handleAddMember(d.id, e)} className="dl-add-form">
                  <input 
                    name="registration_number"
                    type="text" 
                    placeholder="Enter user registration number to add…" 
                    className="input-field"
                    required
                  />
                  <button type="submit" className="btn btn-primary btn-sm">
                    <UserPlus size={16} /> Add 
                  </button>
                </form>

                <div className="dl-members-table-wrap">
                  <table className="dl-members-table">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Registration No</th>
                        <th className="align-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.members?.length === 0 ? (
                        <tr>
                          <td colSpan="3" className="dl-no-members">No members in this domain yet.</td>
                        </tr>
                      ) : (
                        d.members?.map(m => (
                          <tr key={m.id}>
                            <td>
                              <div className="dl-member-identity">
                                {m.avatar_url ? (
                                  <img src={m.avatar_url} alt="" className="dl-avatar" />
                                ) : (
                                  <div className="dl-avatar placeholder">
                                    {m.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <span className="dl-member-name">{m.name}</span>
                                {m.id === user.id && <span className="badge badge-primary">You</span>}
                              </div>
                            </td>
                            <td><span className="dl-member-email">{m.registration_number || 'N/A'}</span></td>
                            <td className="align-right">
                              <button 
                                className="btn btn-ghost btn-sm dl-remove-btn"
                                onClick={() => handleRemoveMember(d.id, m.id, m.name)}
                                title="Remove member"
                                disabled={m.id === user.id} // Prevents lead from removing self
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
