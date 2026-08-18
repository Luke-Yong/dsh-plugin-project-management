import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactElement } from 'react'
import type { ProjectStateWire } from './contracts.js'
import { isPaneOpen, setPaneOpen, subscribePaneOpen } from './store.js'

export interface ProjectPaneProps {
  sessionId?: string
}

const PANE_STYLE: CSSProperties = {
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
  marginBottom: '6px',
}

/**
 * Project management dock rendered into `conversation.input.dock` (order 10,
 * between the todo strip at 0 and the queue at 20). Visible only while the
 * rail button toggles it open; reads the saved project state from the plugin
 * web route for the current session.
 */
export function ProjectPane({ sessionId }: ProjectPaneProps): ReactElement | null {
  const open = useSyncExternalStore(subscribePaneOpen, isPaneOpen)
  const [state, setState] = useState<ProjectStateWire | undefined>()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open || !sessionId) return
    let cancelled = false
    setLoaded(false)
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
  }, [open, sessionId])

  if (!open) return null

  const timeline = state?.timeline
  return (
    <div style={PANE_STYLE}>
      <div style={HEADER_STYLE}>
        <span>Project management</span>
        <button type="button" onClick={() => setPaneOpen(false)} style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}>
          ✕
        </button>
      </div>
      {!loaded && <div>Loading…</div>}
      {loaded && state === undefined && (
        <div>
          No project in this workspace yet. Ask the agent to interview you and generate a timeline.
        </div>
      )}
      {loaded && state !== undefined && (
        <div style={{ display: 'grid', gap: '4px' }}>
          <div>
            <strong>{state.definition.name}</strong>
            {timeline !== undefined && (
              <span>
                {' '}· {timeline.startDate} → {timeline.endDate} ({timeline.tasks.length} tasks)
              </span>
            )}
          </div>
          {timeline !== undefined && (
            <div>
              Feasible: {timeline.feasible ? 'yes' : 'no'}
              {timeline.criticalPath !== undefined && timeline.criticalPath.length > 0 && (
                <span> · Critical: {timeline.criticalPath.join(' → ')}</span>
              )}
              {timeline.conflicts.map((conflict, index) => (
                <div key={index} style={{ color: '#e1251b' }}>• {conflict}</div>
              ))}
            </div>
          )}
          {state.definition.budgetModel !== undefined && (
            <div>Budget model: {state.definition.budgetModel.kind}</div>
          )}
        </div>
      )}
    </div>
  )
}
