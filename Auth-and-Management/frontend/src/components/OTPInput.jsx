import { useRef } from 'react'
import './OTPInput.css'

export default function OTPInput({
  value = '',
  onChange,
  disabled = false,
  error = false
}) {
  const LENGTH = 6
  const inputs = useRef([])

  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] || '')

  const updateDigit = (idx, char) => {
    const arr = [...digits]
    arr[idx] = char
    onChange(arr.join(''))
  }

  const handleChange = (idx, e) => {
    const val = e.target.value.replace(/\D/g, '')
    if (!val) return

    updateDigit(idx, val[0])

    if (idx < LENGTH - 1) {
      inputs.current[idx + 1]?.focus()
    }
  }

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        updateDigit(idx, '')
      } else if (idx > 0) {
        inputs.current[idx - 1]?.focus()
      }
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, LENGTH)

    onChange(pasted)
  }

  return (
    <div className={`otp-container ${error ? 'otp-error' : ''}`}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={el => (inputs.current[i] = el)}
          type="text"
          maxLength={1}
          inputMode="numeric"
          value={digit}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className="otp-digit"
        />
      ))}
    </div>
  )
}
