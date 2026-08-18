/**
 * DeepSeek brand palette shared by the project surfaces.
 * Primary is the DeepSeek blue (#4D6BFE); accents, bands and neutrals are
 * derived from the brand's own light/dark backgrounds.
 */
export const BRAND = {
  primary: '#4D6BFE', // DeepSeek blue (brand)
  primaryDark: '#4166D5', // pressed / deep accent
  periwinkle: '#6377DC', // secondary accent
  light: '#8FA3F9', // pale tint
  ink: '#292a2d', // primary text (brand dark background)
  muted: '#6b7280', // secondary text
  line: '#dfe4f3', // borders (periwinkle-tinted)
  bandA: '#f9fbff', // light band (brand light background)
  bandB: '#eef1fb', // alternating band
  success: '#2f9e44',
  danger: '#e5484d',
} as const

/** Phase bar colors, cycled by phase index (DeepSeek blues). */
export const PHASE_COLORS = ['#4D6BFE', '#6377DC', '#4166D5', '#8FA3F9'] as const

export function phaseColor(index: number): string {
  return PHASE_COLORS[index % PHASE_COLORS.length]!
}

export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
