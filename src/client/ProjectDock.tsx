import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { ProjectStateWire } from './contracts.js'

export interface ProjectDockProps {
  sessionId?: string
}

const DOCK_STYLE: CSSProperties = {
  border: '1px solid rgba(128, 128, 128, 0.35)',
  borderRadius: '8px',
  margin: '4px 8px',
  padding: '8px 10px',
  fontSize: '12px',
  background: 'rgba(128, 128, 128, 0.06)',
}

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontWeight: 600,
  marginBottom: '4px',
}

/**
 * Compact project management dock for `conversation.input.dock` (order 10).
 * Complements the "Project" view tab: the composer area renders even for
 * blank/0-turn sessions, while the view-tab ring only appears once a session
 * is active. The dock auto-appears whenever a saved project exists and can be
 * dismissed locally.
 */
export function ProjectDock({ sessionId }: ProjectDockProps): ReactElement | null {
  const [state, setState] = useState<ProjectStateWire | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

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
            style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}
          >
            ✕
          </button>
        )}
      </div>
      {!loaded && <div>Loading…</div>}
      {loaded && state !== undefined && (
        <div style={{ display: 'grid', gap: '2px' }}>
          <div>
            <strong>{state.definition.name}</strong>
            {timeline !== undefined && (
              <span> · {timeline.startDate} → {timeline.endDate} ({timeline.tasks.length} tasks)</span>
            )}
          </div>
          {timeline !== undefined && (
            <div>
              Feasible: {timeline.feasible ? 'yes' : 'no'}
              {timeline.conflicts.map((conflict, index) => (
                <div key={index} style={{ color: '#e1251b' }}>• {conflict}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
