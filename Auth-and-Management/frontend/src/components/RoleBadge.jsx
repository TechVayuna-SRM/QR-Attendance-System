/**
 * RoleBadge — displays one or more role pills for a user.
 * Props:
 *   roles  – string[] (e.g. ["admin", "club_member"])
 *   size   – "xs" | "sm" | "md" (default "sm")
 */
const ROLE_CONFIG = {
  admin:       { label: '⚡ Admin',       className: 'badge-admin' },
  domain_lead: { label: '🏆 Domain Lead', className: 'badge-domain_lead' },
  club_member: { label: '👤 Member',      className: 'badge-club_member' },
}

export default function RoleBadge({ roles = [], size = 'sm' }) {
  if (!roles?.length) return null

  // Show highest-privilege role first
  const sorted = [...roles].sort((a, b) => {
    const order = { admin: 0, domain_lead: 1, club_member: 2 }
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
