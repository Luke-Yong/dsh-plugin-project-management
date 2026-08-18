import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { ProjectStateWire } from './contracts.js'
import { GanttChart } from './GanttChart.js'
import { BRAND, hexToRgba } from './colors.js'

export interface ProjectDockProps {
  sessionId?: string
}

const DOCK_STYLE: CSSProperties = {
  border: `1px solid ${hexToRgba(BRAND.primary, 0.35)}`,
  borderRadius: '8px',
  margin: '4px 8px',
  padding: '8px 10px',
  fontSize: '12px',
  background: hexToRgba(BRAND.primary, 0.05),
}

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontWeight: 600,
  marginBottom: '4px',
  color: BRAND.primary,
}

const CLOSE_STYLE: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: BRAND.muted,
  fontSize: 12,
}

const TOGGLE_STYLE: CSSProperties = {
  display: 'inline-flex',
  border: `1px solid ${BRAND.line}`,
  borderRadius: '6px',
  overflow: 'hidden',
  marginBottom: '4px',
}

const TOGGLE_BUTTON: CSSProperties = {
  font: 'inherit',
  fontSize: 11,
  padding: '2px 10px',
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: BRAND.primary,
}

const TOGGLE_ACTIVE: CSSProperties = { background: BRAND.primary, color: '#fff' }

type ViewMode = 'text' | 'gantt'

/**
 * Compact project management dock for `conversation.input.dock` (order 10).
 * Complements the "Project" view tab: the composer area renders even for
 * blank/0-turn sessions, while the view-tab ring only appears once a session
 * is active. The dock auto-appears whenever a saved project exists and can be
 * dismissed locally. A segmented control switches between the text summary
 * and a client-side Gantt chart.
 */
export function ProjectDock({ sessionId }: ProjectDockProps): ReactElement | null {
  const [state, setState] = useState<ProjectStateWire | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [view, setView] = useState<ViewMode>('text')

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    void fetch(`/plugins/project-management/state?session=${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : undefined))
      .then((data) => {
        if (cancelled) return
        setState(data as ProjectStateWire | undefined)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const timeline = state?.timeline
  if (loaded && (state === undefined || dismissed)) return null

  return (
    <div style={DOCK_STYLE}>
      <div style={HEADER_STYLE}>
        <span>Project management</span>
        {state !== undefined && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            title="Close"
            style={CLOSE_STYLE}
          >
            ✕
          </button>
        )}
      </div>
      {!loaded && <div style={{ color: BRAND.muted }}>Loading…</div>}
      {loaded && state !== undefined && (
        <div style={{ display: 'grid', gap: '2px' }}>
          {timeline !== undefined && timeline.tasks.length > 0 && (
            <div style={TOGGLE_STYLE}>
              <button
                type="button"
                onClick={() => setView('text')}
                style={view === 'text' ? { ...TOGGLE_BUTTON, ...TOGGLE_ACTIVE } : TOGGLE_BUTTON}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => setView('gantt')}
                style={view === 'gantt' ? { ...TOGGLE_BUTTON, ...TOGGLE_ACTIVE } : TOGGLE_BUTTON}
              >
                Gantt
              </button>
            </div>
          )}
          {view === 'gantt' && timeline !== undefined && timeline.tasks.length > 0 ? (
            <GanttChart timeline={timeline} nameWidth={120} maxHeight={360} />
          ) : (
            <div style={{ display: 'grid', gap: '2px' }}>
              <div style={{ color: BRAND.ink }}>
                <strong>{state.definition.name}</strong>
                {timeline !== undefined && (
                  <span style={{ color: BRAND.muted }}>
                    {' '}· {timeline.startDate} → {timeline.endDate} ({timeline.tasks.length} tasks)
                  </span>
                )}
              </div>
              {timeline !== undefined && (
                <div>
                  <span
                    style={{
                      color: timeline.feasible ? BRAND.success : BRAND.danger,
                      fontWeight: 600,
                    }}
                  >
                    {timeline.feasible ? 'Feasible' : 'Not feasible'}
                  </span>
                  {timeline.conflicts.map((conflict, index) => (
                    <div key={index} style={{ color: BRAND.danger }}>• {conflict}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
