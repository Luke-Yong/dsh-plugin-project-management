import { useEffect, useState } from 'react'
import type { Palette } from './colors.js'
import { DARK, LIGHT } from './colors.js'

export type ThemeMode = 'light' | 'dark'

/**
 * Detect the harness theme. Checks common markers on `<html>`/`<body>`
 * (`data-theme`, `data-color-mode`, `data-mode`, dark/light classes) and
 * falls back to the background luminance when no marker is present.
 */
function detectTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'light'
  const root = document.documentElement
  for (const attr of ['data-theme', 'data-color-mode', 'data-mode']) {
    const value = root.getAttribute(attr)
    if (value !== null) {
      const normalized = value.toLowerCase()
      if (normalized.includes('dark')) return 'dark'
      if (normalized.includes('light')) return 'light'
    }
  }
  const classes = `${root.className} ${document.body.className}`.toLowerCase()
  if (/\bdark\b|theme-dark/.test(classes)) return 'dark'
  if (/\blight\b/.test(classes)) return 'light'
  const match = getComputedStyle(document.body).backgroundColor.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (match !== null) {
    const luminance = (Number(match[1]) * 299 + Number(match[2]) * 587 + Number(match[3]) * 114) / 1000
    return luminance < 128 ? 'dark' : 'light'
  }
  return 'light'
}

/** Reactive theme; re-detects when the harness flips its theme marker. */
export function useTheme(): ThemeMode {
  const [theme, setTheme] = useState<ThemeMode>(detectTheme)
  useEffect(() => {
    const check = (): void => setTheme(detectTheme())
    const observer = new MutationObserver(check)
    for (const target of [document.documentElement, document.body]) {
      observer.observe(target, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'data-color-mode', 'data-mode'],
      })
    }
    window.addEventListener('themechange', check)
    return () => {
      observer.disconnect()
      window.removeEventListener('themechange', check)
    }
  }, [])
  return theme
}

/** Palette matching the current harness theme. */
export function useThemeColors(): Palette {
  return useTheme() === 'dark' ? DARK : LIGHT
}
