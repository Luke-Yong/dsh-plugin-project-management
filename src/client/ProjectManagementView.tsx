import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { ProjectStateWire } from './contracts.js'

export interface ProjectManagementViewProps {
  sessionId?: string
}

const WRAP: CSSProperties = {
  height: '100%',
  overflowY: 'auto',
  padding: '16px 24px',
  fontSize: '13px',
  lineHeight: 1.5,
  maxWidth: '860px',
}

const ROW: CSSProperties = { margin: '6px 0' }

const MUTED: CSSProperties = { color: '#888', fontSize: '12px' }

/**
 * Project management view body for the `conversation.view` "Project" tab.
 * Reads the saved project state from the plugin web route for the current
 * session and renders the definition + timeline summary.
 */
export function ProjectManagementView({ sessionId }: ProjectManagementViewProps): ReactElement {
  const [state, setState] = useState<ProjectStateWire | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    if (!sessionId) {
      setLoaded(true)
      setError('No session available — open a conversation first.')
      return
    }
    let cancelled = false
    setLoaded(false)
    setError(undefined)
    void fetch(`/plugins/project-management/state?session=${encodeURIComponent(sessionId)}`)
      .then(async (res) => {
        if (!res.ok) return undefined
        return (await res.json()) as ProjectStateWire
      })
      .then((data) => {
        if (cancelled) return
        setState(data)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded(true)
          setError('Failed to load project state.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const timeline = state?.timeline
  return (
    <div style={WRAP}>
      <h2 style={{ margin: '0 0 12px', fontSize: '17px' }}>Project management</h2>

      {!loaded && <p style={ROW}>Loading…</p>}
      {error !== undefined && <p style={ROW}>{error}</p>}

      {loaded && error === undefined && state === undefined && (
        <p style={ROW}>
          No project in this workspace yet. Ask the agent to run the project interview, then
          generate a timeline (pm.timeline.generate) and export it (pm.timeline.export).
        </p>
      )}

      {loaded && error === undefined && state !== undefined && (
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '15px' }}>{state.definition.name}</h3>
          {state.definition.description !== undefined && <p style={MUTED}>{state.definition.description}</p>}
          <p style={MUTED}>Updated {new Date(state.updatedAt).toLocaleString()}</p>

          {timeline !== undefined && (
            <div>
              <p style={ROW}>
                <strong>Timeline:</strong> {timeline.startDate} → {timeline.endDate} ·{' '}
                {timeline.tasks.length} tasks ·{' '}
                <span style={{ color: timeline.feasible ? '#2e7d32' : '#e1251b' }}>
                  {timeline.feasible ? 'feasible' : 'not feasible'}
                </span>
              </p>

              {timeline.phases !== undefined && timeline.phases.length > 0 && (
                <div style={ROW}>
                  <strong>Phases:</strong>
                  <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                    {timeline.phases.map((phase) => (
                      <li key={phase.name}>
                        {phase.name}: {phase.start} → {phase.end}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {timeline.criticalPath !== undefined && timeline.criticalPath.length > 0 && (
                <p style={ROW}>
                  <strong>Critical path:</strong> {timeline.criticalPath.join(' → ')}
                </p>
              )}

              {timeline.conflicts.length > 0 && (
                <div style={ROW}>
                  <strong style={{ color: '#e1251b' }}>Conflicts:</strong>
                  <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                    {timeline.conflicts.map((conflict) => (
                      <li key={conflict} style={{ color: '#e1251b' }}>{conflict}</li>
                    ))}
                  </ul>
                </div>
              )}

              {timeline.milestones !== undefined && timeline.milestones.length > 0 && (
                <div style={ROW}>
                  <strong>Milestones:</strong>
                  <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                    {timeline.milestones.map((milestone) => (
                      <li key={`${milestone.name}-${milestone.date}`}>
                        {milestone.date} — {milestone.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {state.definition.budgetModel !== undefined && (
            <p style={ROW}>
              <strong>Agent budget:</strong> {state.definition.budgetModel.kind}
            </p>
          )}

          <p style={{ ...MUTED, marginTop: '12px' }}>
            Re-run the interview or adjust the timeline in chat; the pane reads the saved
            data/project_management/project_data.json.
          </p>
        </div>
      )}
    </div>
  )
}
