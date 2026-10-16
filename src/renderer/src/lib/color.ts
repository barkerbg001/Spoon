// Colour helpers used to keep a user-chosen accent accessible in both themes.

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.round(Math.min(255, Math.max(0, v)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return rgbToHex([
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t
  ])
}

/** Move the accent towards white/black until it reaches the target contrast against the background. */
export function accessibleAccent(accent: string, background: string, target = 3.2): string {
  const towards = luminance(background) < 0.5 ? '#ffffff' : '#000000'
  let c = accent
  for (let t = 0.05; contrast(c, background) < target && t <= 1; t += 0.05)
    c = mix(accent, towards, t)
  return c
}

/** Text colour (white or near-black) with the best contrast on the given fill. */
export function onColor(fill: string): string {
  return contrast(fill, '#ffffff') >= contrast(fill, '#111114') ? '#ffffff' : '#111114'
}
