import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import RoleBadge from './RoleBadge'
import {
  LogOut, User, Settings, ShieldCheck, Menu, X, Globe
} from 'lucide-react'
import './Navbar.css'

export default function Navbar() {
  const { user, isAuthenticated, logout, hasRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Contextual domain name — only shown when admin/lead is on a domain dashboard
  const [activeDomainName, setActiveDomainName] = useState(null)

  // Extract domainId from the current path if on a dashboard route
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

  // Hide navbar on verify-email page (mid-OTP flow, disorienting to show)
  if (location.pathname === '/verify-email') return null

  // Simplified navbar: only logo + sign out. No nav links.
  // Shown on /login, /onboarding, and while waiting for approval.
  const isSimplified =
    ['/login', '/onboarding'].includes(location.pathname) ||
    (isAuthenticated && user && !user.is_approved)

  if (isSimplified) {
    return (
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/login" className="navbar-logo">
            <img src="/logo.png" alt="TechVayana Logo" style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '8px' }} />
            <span className="navbar-logo-text">
              Tech<span className="gradient-text">Vayana</span>
            </span>
          </Link>
          {isAuthenticated && (
            <div className="navbar-right">
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => { await logout(); navigate('/login') }}
                title="Sign out"
              >
                <LogOut size={16} />
                <span className="hide-sm">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </nav>
    )
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isActive = (path) => location.pathname.startsWith(path)

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Logo */}
        <Link to={isAuthenticated ? '/profile' : '/login'} className="navbar-logo">
          <img src="/logo.png" alt="TechVayana Logo" style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '8px' }} />
          <span className="navbar-logo-text">
            Tech<span className="gradient-text">Vayana</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        {isAuthenticated && (
          <div className="navbar-links">
            <Link
              to="/profile"
              className={`nav-link ${isActive('/profile') ? 'active' : ''}`}
            >
              <User size={16} /> Profile
            </Link>

            {hasRole('admin') && (
              <Link
                to="/admin"
                className={`nav-link ${isActive('/admin') ? 'active' : ''}`}
              >
                <ShieldCheck size={16} /> Admin
              </Link>
            )}

            {/* Show domain name contextually when on a domain dashboard */}
            {activeDomainName && (
              <span className="nav-link active" style={{ pointerEvents: 'none' }}>
                <Globe size={16} /> {activeDomainName}
              </span>
            )}

            {/* Domain Lead nav: only show their domain name (not for admins, handled contextually above) */}
            {hasRole('domain_lead') && !hasRole('admin') && !activeDomainName && user?.led_domains?.length > 0 && (
              user.led_domains.length === 1 ? (
                <Link
                  to={`/domain/${user.led_domains[0].id}/dashboard`}
                  className={`nav-link ${isActive('/domain') ? 'active' : ''}`}
                >
                  <Settings size={16} /> {user.led_domains[0].name}
                </Link>
              ) : (
                <div className="nav-dropdown">
                  <span className={`nav-link ${isActive('/domain') ? 'active' : ''}`} style={{cursor: 'pointer'}}>
                    <Settings size={16} /> My Domains ▼
                  </span>
                  <div className="dropdown-menu">
                    {user.led_domains.map(d => (
                      <Link key={d.id} to={`/domain/${d.id}/dashboard`} className="dropdown-item">
                        <span style={{fontSize:'1.2rem'}}>{d.icon}</span> {d.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Right side */}
        <div className="navbar-right">
          {isAuthenticated && user ? (
            <>
              <div className="navbar-user">
                {user.avatar_url
                  ? <img src={user.avatar_url} alt={user.name} className="navbar-avatar" />
                  : <div className="navbar-avatar-placeholder">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                }
                <div className="navbar-user-info">
                  <span className="navbar-user-name">{user.name}</span>
                  <RoleBadge roles={user.roles} size="xs" />
                </div>
              </div>
              <button
                id="navbar-logout-btn"
                className="btn btn-ghost btn-sm"
                onClick={handleLogout}
                title="Sign out"
              >
                <LogOut size={16} />
                <span className="hide-sm">Sign out</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">Sign In</Link>
          )}

          {/* Mobile hamburger */}
          <button
            className="btn btn-ghost btn-sm navbar-hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && isAuthenticated && (
        <div className="navbar-mobile-menu">
          <Link to="/profile" className="mobile-nav-link" onClick={() => setMenuOpen(false)}>
            <User size={16} /> Profile
          </Link>
          {hasRole('admin') && (
            <Link to="/admin" className="mobile-nav-link" onClick={() => setMenuOpen(false)}>
              <ShieldCheck size={16} /> Admin
            </Link>
          )}
          {hasRole('domain_lead') && !hasRole('admin') && user?.led_domains?.map(d => (
            <Link key={d.id} to={`/domain/${d.id}/dashboard`} className="mobile-nav-link" onClick={() => setMenuOpen(false)}>
              <Settings size={16} /> {d.name}
            </Link>
          ))}
          <button className="mobile-nav-link danger" onClick={handleLogout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </nav>
  )
}
