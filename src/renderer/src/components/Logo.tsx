import * as React from 'react'

/** Spoon mark: two branch lines converging into one commit. Kept in sync with build/icon.svg. */
export function Logo({
  size = 32,
  className
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  const id = React.useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Spoon"
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e3304f" />
          <stop offset="1" stopColor="#9e1230" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="22" fill={`url(#${id}-g)`} />
      <path
        d="M30 27 C30 50 50 52 50 74 M70 27 C70 50 50 52 50 74"
        stroke="#fff"
        strokeWidth="7.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="30" cy="27" r="8.5" fill="#fff" />
      <circle cx="70" cy="27" r="8.5" fill="#fff" />
      <circle cx="50" cy="76" r="10" fill="#fff" />
      <circle cx="50" cy="76" r="4.2" fill="#b5193a" />
    </svg>
  )
}
