const ROLE_CONFIG = {
  admin:       { label: '⚡ Admin',       className: 'badge-admin' },
  domain_lead: { label: '🏆 Domain Lead', className: 'badge-domain_lead' },
  club_member: { label: '👤 Member',      className: 'badge-club_member' },
  member:      { label: '👤 Member',      className: 'badge-club_member' },
  faculty:     { label: '🎓 Faculty',     className: 'badge-domain_lead' },
}

export default function RoleBadge({ roles = [], size = 'sm' }) {
  if (!roles?.length) return null

  const sorted = [...roles].sort((a, b) => {
    const order = { admin: 0, domain_lead: 1, faculty: 2, club_member: 3, member: 3 }
    return (order[a] ?? 9) - (order[b] ?? 9)
  })

  const sizeClass = size === 'xs' ? 'badge-xs' : size === 'md' ? 'badge-md' : ''

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {sorted.map(role => {
        const cfg = ROLE_CONFIG[role] ?? { label: role, className: 'badge-club_member' }
        return (
          <span key={role} className={`badge ${cfg.className} ${sizeClass}`}>
            {cfg.label}
          </span>
        )
      })}
    </div>
  )
}
