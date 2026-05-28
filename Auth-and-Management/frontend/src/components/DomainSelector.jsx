import './DomainSelector.css'

/**
 * DomainSelector — grid of checkbox cards for multi-domain selection.
 *
 * Props:
 *   domains      – Domain[] (all available domains)
 *   selected     – number[] (selected domain IDs)
 *   onChange     – (ids: number[]) => void
 *   disabled     – boolean
 *   maxSelect    – number (default 10)
 */
export default function DomainSelector({
  domains    = [],
  selected   = [],
  onChange,
  disabled   = false,
  maxSelect  = 10,
}) {
  const toggle = (id) => {
    if (disabled) return
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id))
    } else {
      if (selected.length >= maxSelect) return
      onChange([...selected, id])
    }
  }

  return (
    <div className="domain-grid">
      {domains.map(domain => {
        const isSelected = selected.includes(domain.id)
        const isDisabled = disabled || (!isSelected && selected.length >= maxSelect)

        return (
          <button
            key={domain.id}
            id={`domain-card-${domain.id}`}
            type="button"
            className={`domain-card ${isSelected ? 'selected' : ''} ${isDisabled && !isSelected ? 'maxed' : ''}`}
            onClick={() => toggle(domain.id)}
            disabled={isDisabled && !isSelected}
            title={domain.description}
            aria-pressed={isSelected}
          >
            <div className="domain-card-check">
              {isSelected && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="domain-card-icon">{domain.icon}</span>
            <span className="domain-card-name">{domain.name}</span>
            {domain.description && (
              <span className="domain-card-desc">{domain.description}</span>
            )}
          </button>
        )
      })}

      {domains.length === 0 && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', gridColumn: '1/-1' }}>
          No domains available yet.
        </p>
      )}
    </div>
  )
}
