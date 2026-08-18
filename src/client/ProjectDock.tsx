import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
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
 * Compact project management dock for `conversation.input.dock` (order 10).
 * Complements the "Project" view tab: the composer area renders even for
 * blank/0-turn sessions, while the view-tab ring only appears once a session
 * is active. The dock auto-appears whenever a saved project exists and can be
 * dismissed locally. A segmented control switches between the text summary
 * and a client-side Gantt chart; both surfaces follow the harness theme.
 */
export function ProjectDock({ sessionId }: ProjectDockProps): ReactElement | null {
  const c = useThemeColors()
  const [state, setState] = useState<ProjectStateWire | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [view, setView] = useState<ViewMode>('text')

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    void fetchProjectState(sessionId)
      .then((data) => {
        if (cancelled) return
        setState(data)
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

  const handleCommit = async (updates: TaskDateUpdate[]): Promise<void> => {
    if (!sessionId) return
    const next = await updateProjectTimeline(sessionId, updates)
    if (next !== undefined) setState(next)
  }

  const dockStyle: CSSProperties = {
    border: `1px solid ${hexToRgba(c.primary, 0.35)}`,
    borderRadius: '8px',
    margin: '4px 8px',
    padding: '8px 10px',
    fontSize: '12px',
    background: hexToRgba(c.primary, 0.05),
  }

  const headerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 600,
    marginBottom: '4px',
    color: c.primary,
  }

  const closeStyle: CSSProperties = {
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
    <div style={dockStyle}>
      <div style={headerStyle}>
        <span>Project management</span>
        {state !== undefined && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            title="Close"
            style={closeStyle}
          >
            ✕
          </button>
        )}
      </div>
      {!loaded && <div style={{ color: c.muted }}>Loading…</div>}
      {loaded && state !== undefined && (
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
                    {' '}· {timeline.startDate} → {timeline.endDate} ({timeline.tasks.length} tasks)
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
  )
}
