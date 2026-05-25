import { useState } from 'react'

/**
 * Displays a branch logo with initials fallback.
 * Props:
 *   - name: branch name (used for initials fallback)
 *   - logoUrl: full URL to the logo image (optional)
 *   - size: pixel size (default 36)
 */

const COLORS = [
  '#2563eb', '#059669', '#d97706', '#7c3aed',
  '#dc2626', '#0891b2', '#db2777', '#65a30d',
]

function getColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

function getInitials(name) {
  return name
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function BranchLogo({ name = '', logoUrl, size = 36, style = {} }) {
  const [imgError, setImgError] = useState(false)
  const showImg = logoUrl && !imgError

  const baseStyle = {
    width: size,
    height: size,
    minWidth: size,
    borderRadius: size >= 48 ? 12 : 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
    ...style,
  }

  if (showImg) {
    return (
      <div style={baseStyle}>
        <img
          src={logoUrl}
          alt={name}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    )
  }

  const bg = getColor(name)
  return (
    <div
      style={{
        ...baseStyle,
        background: `${bg}18`,
        color: bg,
        fontSize: size * 0.36,
        fontWeight: 700,
        letterSpacing: 0.5,
      }}
    >
      {getInitials(name)}
    </div>
  )
}
