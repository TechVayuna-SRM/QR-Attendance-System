import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import RoleBadge from './RoleBadge'
import { LogOut, User, Settings, ShieldCheck, Menu, X, Globe, Home, QrCode, BarChart2, Users } from 'lucide-react'
import './Navbar.css'

export default function Navbar() {
  const { user, isAuthenticated, logout, hasRole } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeDomainName, setActiveDomainName] = useState(null)

  const dashboardMatch = location.pathname.match(/^\/domain\/(\d+)\/dashboard$/)
  const activeDomainId = dashboardMatch ? dashboardMatch[1] : null

  useEffect(() => {
    if (activeDomainId) {
      api.get(`/domain-dashboard/${activeDomainId}`)
        .then(res => setActiveDomainName(res.data.domain?.name ?? null))
        .catch(() => setActiveDomainName(null))
    } else {
      setActiveDomainName(null)
    }
  }, [activeDomainId])

  if (location.pathname === '/verify-otp') return null

  const isSimplified =
    ['/login', '/onboarding'].includes(location.pathname) ||
    (isAuthenticated && user && !user.is_approved)

  if (isSimplified) {
    return (
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/login" className="navbar-logo">
            <img src="/phoenix.png" alt="Logo" style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '8px' }} />
            <span className="navbar-logo-text">Tech<span className="gradient-text">Vayana</span></span>
          </Link>
          {isAuthenticated && (
            <div className="navbar-right">
              <button className="btn btn-ghost btn-sm" onClick={async () => { await logout(); navigate('/login') }} title="Sign out">
                <LogOut size={16} /><span className="hide-sm">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </nav>
    )
  }

  const handleLogout = async () => { await logout(); navigate('/login') }
  const isActive = (path) => location.pathname.startsWith(path)

  const userRoles = user?.roles || (user?.role ? [user.role] : [])

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to={isAuthenticated ? '/dashboard' : '/login'} className="navbar-logo">
          <img src="/phoenix.png" alt="Logo" style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '8px' }} />
          <span className="navbar-logo-text">Tech<span className="gradient-text">Vayana</span></span>
        </Link>

        {isAuthenticated && (
          <div className="navbar-links">
            <Link to="/dashboard" className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}>
              <Home size={16} /> Dashboard
            </Link>
            <Link to="/profile" className={`nav-link ${isActive('/profile') ? 'active' : ''}`}>
              <User size={16} /> Profile
            </Link>
            {(hasRole('admin', 'faculty')) && (
              <Link to="/generate-qr" className={`nav-link ${isActive('/generate-qr') ? 'active' : ''}`}>
                <QrCode size={16} /> Generate QR
              </Link>
            )}
            {!hasRole('faculty') && (
              <Link to="/scan" className={`nav-link ${isActive('/scan') ? 'active' : ''}`}>
                <QrCode size={16} /> Scan QR
              </Link>
            )}
            {(hasRole('admin', 'domain_lead', 'faculty')) && (
              <Link to="/users" className={`nav-link ${isActive('/users') ? 'active' : ''}`}>
                <Users size={16} /> Users
              </Link>
            )}
            {hasRole('admin', 'faculty') && (
              <Link to="/admin" className={`nav-link ${isActive('/admin') ? 'active' : ''}`}>
                <ShieldCheck size={16} /> Admin
              </Link>
            )}
            {activeDomainName && (
              <span className="nav-link active" style={{ pointerEvents: 'none' }}>
                <Globe size={16} /> {activeDomainName}
              </span>
            )}
            {hasRole('domain_lead') && !hasRole('admin') && !activeDomainName && user?.led_domains?.length > 0 && (
              user.led_domains.length === 1 ? (
                <Link to={`/domain/${user.led_domains[0].id}/dashboard`} className={`nav-link ${isActive('/domain') ? 'active' : ''}`}>
                  <Settings size={16} /> {user.led_domains[0].name}
                </Link>
              ) : (
                <div className="nav-dropdown">
                  <span className={`nav-link ${isActive('/domain') ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
                    <Settings size={16} /> My Domains ▼
                  </span>
                  <div className="dropdown-menu">
                    {user.led_domains.map(d => (
                      <Link key={d.id} to={`/domain/${d.id}/dashboard`} className="dropdown-item">
                        <span style={{ fontSize: '1.2rem' }}>{d.icon}</span> {d.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        <div className="navbar-right">
          {isAuthenticated && user ? (
            <>
              <div className="navbar-user">
                {user.avatar_url
                  ? <img src={user.avatar_url} alt={user.name} className="navbar-avatar" />
                  : <div className="navbar-avatar-placeholder">{user.name.charAt(0).toUpperCase()}</div>
                }
                <div className="navbar-user-info">
                  <span className="navbar-user-name">{user.name}</span>
                  <RoleBadge roles={userRoles} size="xs" />
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={handleLogout} title="Sign out">
                <LogOut size={16} /><span className="hide-sm">Sign out</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">Sign In</Link>
          )}
          <button className="btn btn-ghost btn-sm navbar-hamburger" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {menuOpen && isAuthenticated && (
        <div className="navbar-mobile-menu">
          <Link to="/dashboard" className="mobile-nav-link" onClick={() => setMenuOpen(false)}><Home size={16} /> Dashboard</Link>
          <Link to="/profile" className="mobile-nav-link" onClick={() => setMenuOpen(false)}><User size={16} /> Profile</Link>
          {!hasRole('faculty') && <Link to="/scan" className="mobile-nav-link" onClick={() => setMenuOpen(false)}><QrCode size={16} /> Scan QR</Link>}
          {hasRole('admin', 'faculty') && <Link to="/admin" className="mobile-nav-link" onClick={() => setMenuOpen(false)}><ShieldCheck size={16} /> Admin</Link>}
          {hasRole('domain_lead') && !hasRole('admin') && user?.led_domains?.map(d => (
            <Link key={d.id} to={`/domain/${d.id}/dashboard`} className="mobile-nav-link" onClick={() => setMenuOpen(false)}>
              <Settings size={16} /> {d.name}
            </Link>
          ))}
          <button className="mobile-nav-link danger" onClick={handleLogout}><LogOut size={16} /> Sign out</button>
        </div>
      )}
    </nav>
  )
}
