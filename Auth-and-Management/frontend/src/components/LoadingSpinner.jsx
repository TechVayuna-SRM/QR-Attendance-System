import './LoadingSpinner.css'

export default function LoadingSpinner({ fullscreen = false, size = 40, label = '' }) {
  const spinner = (
    <div className="spinner-wrap">
      <div className="spinner-ring" style={{ width: size, height: size }}>
        <div />
        <div />
        <div />
        <div />
      </div>
      {label && <p className="spinner-label">{label}</p>}
    </div>
  )

  if (fullscreen) {
    return (
      <div className="spinner-fullscreen">
        {spinner}
      </div>
    )
  }

  return spinner
}
