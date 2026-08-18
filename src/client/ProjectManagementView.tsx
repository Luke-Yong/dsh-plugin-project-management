import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { ProjectStateWire, TaskDateUpdate } from './contracts.js'
import { GanttChart } from './GanttChart.js'
import { BRAND } from './colors.js'
import { fetchProjectState, updateProjectTimeline } from './api.js'

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

const MUTED: CSSProperties = { color: BRAND.muted, fontSize: '12px' }

const TOGGLE_STYLE: CSSProperties = {
  display: 'inline-flex',
  border: `1px solid ${BRAND.line}`,
  borderRadius: '6px',
  overflow: 'hidden',
}

const TOGGLE_BUTTON: CSSProperties = {
  font: 'inherit',
  fontSize: 12,
  padding: '4px 14px',
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: BRAND.primary,
}

const TOGGLE_ACTIVE: CSSProperties = { background: BRAND.primary, color: '#fff' }

const EDIT_BUTTON: CSSProperties = {
  font: 'inherit',
  fontSize: 12,
  padding: '4px 14px',
  cursor: 'pointer',
  border: `1px solid ${BRAND.line}`,
  borderRadius: '6px',
  background: 'transparent',
  color: BRAND.primary,
}

const INPUT: CSSProperties = {
  font: 'inherit',
  fontSize: 12,
  padding: '2px 6px',
  border: `1px solid ${BRAND.line}`,
  borderRadius: '4px',
  background: '#fff',
  color: BRAND.ink,
  width: '100%',
  boxSizing: 'border-box',
}

type ViewMode = 'text' | 'gantt'

interface TaskDraft {
  id: string
  name: string
  start: string
  end: string
  owner: string
}

/**
 * Project management view body for the `conversation.view` "Project" tab.
 * Reads the saved project state from the plugin web route for the current
 * session and renders the definition + timeline summary, with a segmented
 * control to switch between the text summary and a client-side Gantt chart.
 * An "Edit" mode lets the user adjust task dates/names/owners directly; drag
 * gestures on the Gantt bars commit through the same update endpoint.
 */
export function ProjectManagementView({ sessionId }: ProjectManagementViewProps): ReactElement {
  const [state, setState] = useState<ProjectStateWire | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [view, setView] = useState<ViewMode>('text')
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<TaskDraft[] | undefined>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!sessionId) {
      setLoaded(true)
      setError('No session available — open a conversation first.')
      return
    }
    let cancelled = false
    setLoaded(false)
    setError(undefined)
    void fetchProjectState(sessionId)
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

  const beginEdit = (): void => {
    if (timeline === undefined) return
    setDraft(timeline.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      start: task.start,
      end: task.end,
      owner: task.owner ?? '',
    })))
    setEditMode(true)
  }

  const saveDraft = async (): Promise<void> => {
    if (draft === undefined || timeline === undefined || !sessionId) return
    const updates: TaskDateUpdate[] = []
    for (const row of draft) {
      const original = timeline.tasks.find((task) => task.id === row.id)
      if (original === undefined) continue
      const update: TaskDateUpdate = { id: row.id }
      if (row.start !== original.start) update.start = row.start
      if (row.end !== original.end) update.end = row.end
      if (row.name !== original.name) update.name = row.name
      if ((row.owner ?? '') !== (original.owner ?? '')) update.owner = row.owner
      if (Object.keys(update).length > 1) updates.push(update)
    }
    if (updates.length === 0) {
      setEditMode(false)
      setDraft(undefined)
      return
    }
    setSaving(true)
    const next = await updateProjectTimeline(sessionId, updates)
    setSaving(false)
    if (next !== undefined) setState(next)
    setEditMode(false)
    setDraft(undefined)
  }

  const draftInvalid = draft !== undefined && draft.some((row) => row.start > row.end)

  const handleCommit = async (updates: TaskDateUpdate[]): Promise<void> => {
    if (!sessionId) return
    const next = await updateProjectTimeline(sessionId, updates)
    if (next !== undefined) setState(next)
  }

  return (
    <div style={WRAP}>
      <h2 style={{ margin: '0 0 12px', fontSize: '17px', color: BRAND.primary }}>Project management</h2>

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
          <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: BRAND.ink }}>{state.definition.name}</h3>
          {state.definition.description !== undefined && <p style={MUTED}>{state.definition.description}</p>}
          <p style={MUTED}>Updated {new Date(state.updatedAt).toLocaleString()}</p>

          {timeline !== undefined && (
            <div>
              {!editMode && (
                <div style={{ display: 'flex', gap: '8px', margin: '0 0 10px' }}>
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
                  <button type="button" style={EDIT_BUTTON} onClick={beginEdit}>
                    Edit
                  </button>
                </div>
              )}

              {editMode ? (
                <div style={ROW}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 140px 140px 1fr',
                      gap: '6px',
                      padding: '4px 0',
                      fontSize: 11,
                      fontWeight: 600,
                      color: BRAND.muted,
                    }}
                  >
                    <span>Task</span>
                    <span>Start</span>
                    <span>End</span>
                    <span>Owner</span>
                  </div>
                  {(draft ?? []).map((row) => (
                    <div
                      key={row.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 140px 140px 1fr',
                        gap: '6px',
                        padding: '2px 0',
                      }}
                    >
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => setDraft((prev) => prev?.map((r) => r.id === row.id ? { ...r, name: e.target.value } : r))}
                        style={INPUT}
                      />
                      <input
                        type="date"
                        value={row.start}
                        onChange={(e) => setDraft((prev) => prev?.map((r) => r.id === row.id ? { ...r, start: e.target.value } : r))}
                        style={INPUT}
                      />
                      <input
                        type="date"
                        value={row.end}
                        onChange={(e) => setDraft((prev) => prev?.map((r) => r.id === row.id ? { ...r, end: e.target.value } : r))}
                        style={INPUT}
                      />
                      <input
                        type="text"
                        value={row.owner}
                        onChange={(e) => setDraft((prev) => prev?.map((r) => r.id === row.id ? { ...r, owner: e.target.value } : r))}
                        style={INPUT}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      type="button"
                      disabled={saving || draftInvalid}
                      onClick={() => void saveDraft()}
                      style={{ ...EDIT_BUTTON, background: BRAND.primary, color: '#fff', borderColor: BRAND.primary }}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setEditMode(false)
                        setDraft(undefined)
                      }}
                      style={EDIT_BUTTON}
                    >
                      Cancel
                    </button>
                    {draftInvalid && (
                      <span style={{ color: BRAND.danger, fontSize: 11, alignSelf: 'center' }}>
                        Start must be on or before end.
                      </span>
                    )}
                  </div>
                </div>
              ) : view === 'gantt' ? (
                <div style={ROW}>
                  <GanttChart timeline={timeline} onCommit={handleCommit} />
                </div>
              ) : (
                <div>
                  <p style={ROW}>
                    <strong>Timeline:</strong> {timeline.startDate} → {timeline.endDate} ·{' '}
                    {timeline.tasks.length} tasks ·{' '}
                    <span
                      style={{
                        color: timeline.feasible ? BRAND.success : BRAND.danger,
                        fontWeight: 600,
                      }}
                    >
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
                      <strong style={{ color: BRAND.danger }}>Conflicts:</strong>
                      <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                        {timeline.conflicts.map((conflict) => (
                          <li key={conflict} style={{ color: BRAND.danger }}>{conflict}</li>
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
