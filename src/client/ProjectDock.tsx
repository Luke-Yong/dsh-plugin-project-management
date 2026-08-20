import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { ProjectStateWire, TaskDateUpdate } from './contracts.js'
import { GanttChart } from './GanttChart.js'
import { hexToRgba } from './colors.js'
import { useThemeColors } from './theme.js'
import { fetchProjectState, updateProjectTimeline } from './api.js'

export interface ProjectDockProps {
  sessionId?: string
}

type ViewMode = 'text' | 'gantt'

/**
 * The composer root that sizes/centers the composer card (hashed CSS-module
 * class from the harness client). It is the card's direct parent; replicating
 * its box model on the dock wrapper gives the dock the same width.
 */
const COMPOSER_ROOT_SELECTOR = '.PHRFWG_root'

/** Fallback: the composer stack further up the tree (hashed CSS-module class). */
const COMPOSER_STACK_SELECTOR = '.TFSGfa_composerStack'

/** Last resort: the composer card itself (hashed CSS-module class). */
const COMPOSER_CARD_SELECTOR = '.PHRFWG_card'

/** How often the dock re-reads the project state file (hot reload). */
const POLL_MS = 5000

/** Horizontal box model copied from the harness element that sets the width. */
interface BoxModelCss {
  boxSizing: string
  width: string
  maxWidth: string
  paddingLeft: string
  paddingRight: string
  marginLeft: string
  marginRight: string
}

/**
 * Compact project management dock for `conversation.input.dock` (order 10).
 * Complements the "Project" view tab: the composer area renders even for
 * blank/0-turn sessions, while the view-tab ring only appears once a session
 * is active. The dock auto-appears whenever a saved project exists and can be
 * minimized to a header-only bar (it stays available across turns). Its width
 * and horizontal position mirror the composer root (`PHRFWG_root`), which is
 * what sizes the composer card, so it stays aligned as the window resizes. A
 * segmented control switches between the text summary and a client-side Gantt
 * chart; both surfaces follow the harness theme.
 */
export function ProjectDock({ sessionId }: ProjectDockProps): ReactElement | null {
  const c = useThemeColors()
  const dockRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<ProjectStateWire | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [view, setView] = useState<ViewMode>('text')
  const [stackCss, setStackCss] = useState<BoxModelCss | undefined>()
  // Pause hot-reload while the user is interacting (dragging a Gantt bar) so
  // a poll cannot clobber an in-flight optimistic update.
  const interactingRef = useRef(false)
  // Skip re-renders when the fetched state is unchanged.
  const lastStateJsonRef = useRef<string>()
  const minimizedRef = useRef(minimized)
  useEffect(() => {
    minimizedRef.current = minimized
  }, [minimized])

  // Replicate the composer root's horizontal box model (padding, margins,
  // width, max-width, box-sizing) on a wrapper so the dock lays out at exactly
  // the composer card's width and centered position. Falls back to the stack
  // and then the nearest card when the root element is not present.
  useEffect(() => {
    let found = false
    let disposed = false
    let resizeObserver: ResizeObserver | undefined

    /** The element whose box model sizes the composer card. */
    const findWidthSource = (): HTMLElement | null => {
      for (const selector of [COMPOSER_ROOT_SELECTOR, COMPOSER_STACK_SELECTOR]) {
        const el = document.querySelector<HTMLElement>(selector)
        if (el !== null) return el
      }
      const cards = Array.from(document.querySelectorAll<HTMLElement>(COMPOSER_CARD_SELECTOR))
      if (cards.length === 0) return null
      const dockRect = dockRef.current?.getBoundingClientRect()
      let best: HTMLElement = cards[0]!
      let bestScore = Number.POSITIVE_INFINITY
      for (const card of cards) {
        const rect = card.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue
        const score = dockRect !== undefined ? Math.abs(rect.bottom - dockRect.bottom) : rect.bottom
        if (score < bestScore) {
          bestScore = score
          best = card
        }
      }
      return best
    }

    const copyStackCss = (): void => {
      if (disposed) return
      const source = findWidthSource()
      if (source === null) return
      const cs = getComputedStyle(source)
      setStackCss({
        boxSizing: cs.boxSizing,
        width: cs.width,
        maxWidth: cs.maxWidth,
        paddingLeft: cs.paddingLeft,
        paddingRight: cs.paddingRight,
        marginLeft: cs.marginLeft,
        marginRight: cs.marginRight,
      })
    }

    const trySetup = (): void => {
      const source = findWidthSource()
      if (source !== null && !found) {
        found = true
        resizeObserver = new ResizeObserver(copyStackCss)
        resizeObserver.observe(source)
      }
      copyStackCss()
    }

    trySetup()
    // The stack may mount after the dock; watch for it.
    const watcher = new MutationObserver(() => {
      if (!found && findWidthSource() !== null) trySetup()
    })
    watcher.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', copyStackCss)
    return () => {
      disposed = true
      watcher.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', copyStackCss)
    }
  }, [])

  // Hot reload: initial fetch, then poll the state file every POLL_MS while a
  // project is visible, plus a re-fetch on window focus. Paused during drags.
  useEffect(() => {
    const down = (): void => { interactingRef.current = true }
    const up = (): void => { interactingRef.current = false }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [])

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    let busy = false
    const refresh = async (): Promise<void> => {
      if (busy || interactingRef.current || minimizedRef.current) return
      busy = true
      try {
        const data = await fetchProjectState(sessionId)
        if (cancelled) return
        if (data !== undefined) {
          const json = JSON.stringify(data)
          if (json !== lastStateJsonRef.current) {
            lastStateJsonRef.current = json
            setState(data)
          }
        }
        setLoaded(true)
      } catch {
        if (!cancelled) setLoaded(true)
      } finally {
        busy = false
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [sessionId])

  const timeline = state?.timeline
  if (loaded && state === undefined) return null
  const overallProgress = timeline !== undefined && timeline.tasks.length > 0
    ? Math.round(timeline.tasks.reduce((sum, t) => sum + (t.progress ?? 0), 0) / timeline.tasks.length)
    : undefined

  const handleCommit = async (updates: TaskDateUpdate[]): Promise<void> => {
    if (!sessionId) return
    const next = await updateProjectTimeline(sessionId, updates)
    if (next !== undefined) {
      lastStateJsonRef.current = JSON.stringify(next)
      setState(next)
    } else {
      // Commit failed — revert the optimistic drag to the persisted state.
      const current = await fetchProjectState(sessionId)
      if (current !== undefined) setState(current)
    }
  }

  const wrapStyle: CSSProperties = stackCss !== undefined
    ? ({
        boxSizing: stackCss.boxSizing,
        width: stackCss.width,
        maxWidth: stackCss.maxWidth,
        paddingLeft: stackCss.paddingLeft,
        paddingRight: stackCss.paddingRight,
        marginLeft: stackCss.marginLeft,
        marginRight: stackCss.marginRight,
      } as unknown as CSSProperties)
    : {}

  const dockStyle: CSSProperties = {
    border: `1px solid ${hexToRgba(c.primary, 0.35)}`,
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '12px',
    background: hexToRgba(c.primary, 0.05),
    boxSizing: 'border-box',
    ...(stackCss !== undefined
      ? { width: 'auto', margin: '4px 20px' }
      : { margin: '4px 8px' }),
  }

  const headerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 600,
    marginBottom: '4px',
    color: c.primary,
  }

  const iconButtonStyle: CSSProperties = {
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: c.muted,
    fontSize: 12,
  }

  const toggleStyle: CSSProperties = {
    display: 'inline-flex',
    border: `1px solid ${c.line}`,
    borderRadius: '6px',
    overflow: 'hidden',
    marginBottom: '4px',
  }

  const toggleButton: CSSProperties = {
    font: 'inherit',
    fontSize: 11,
    padding: '2px 10px',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: c.primary,
  }

  const toggleActive: CSSProperties = { background: c.primary, color: '#fff' }

  return (
    <div style={wrapStyle}>
      <div style={dockStyle} ref={dockRef}>
        <div style={headerStyle}>
          <span>Project management</span>
          {state !== undefined && (
            <button
              type="button"
              onClick={() => setMinimized((value) => !value)}
              title={minimized ? 'Expand' : 'Minimize'}
              style={iconButtonStyle}
            >
              {minimized ? '▸' : '–'}
            </button>
          )}
        </div>
        {!minimized && !loaded && <div style={{ color: c.muted }}>Loading…</div>}
        {!minimized && loaded && state !== undefined && (
          <div style={{ display: 'grid', gap: '2px' }}>
            {timeline !== undefined && timeline.tasks.length > 0 && (
              <div style={toggleStyle}>
                <button
                  type="button"
                  onClick={() => setView('text')}
                  style={view === 'text' ? { ...toggleButton, ...toggleActive } : toggleButton}
                >
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => setView('gantt')}
                  style={view === 'gantt' ? { ...toggleButton, ...toggleActive } : toggleButton}
                >
                  Gantt
                </button>
              </div>
            )}
            {view === 'gantt' && timeline !== undefined && timeline.tasks.length > 0 ? (
              <GanttChart
                timeline={timeline}
                nameWidth={120}
                maxHeight={360}
                onCommit={handleCommit}
              />
            ) : (
              <div style={{ display: 'grid', gap: '2px' }}>
                <div style={{ color: c.ink }}>
                  <strong>{state.definition.name}</strong>
                  {timeline !== undefined && (
                    <span style={{ color: c.muted }}>
                      {' '}· {timeline.startDate} → {timeline.endDate} ({timeline.tasks.length} tasks
                      {overallProgress !== undefined && <> · {overallProgress}% complete</>})
                    </span>
                  )}
                </div>
                {timeline !== undefined && (
                  <div>
                    <span
                      style={{
                        color: timeline.feasible ? c.success : c.danger,
                        fontWeight: 600,
                      }}
                    >
                      {timeline.feasible ? 'Feasible' : 'Not feasible'}
                    </span>
                    {timeline.conflicts.map((conflict, index) => (
                      <div key={index} style={{ color: c.danger }}>• {conflict}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
