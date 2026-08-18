import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { ProjectStateWire, TaskDateUpdate } from './contracts.js'
import { GanttChart } from './GanttChart.js'
import { useTheme, useThemeColors } from './theme.js'
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
 * gestures on the Gantt bars commit through the same update endpoint. All
 * surfaces follow the harness theme (light/dark).
 */
export function ProjectManagementView({ sessionId }: ProjectManagementViewProps): ReactElement {
  const theme = useTheme()
  const c = useThemeColors()
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

  const muted: CSSProperties = { color: c.muted, fontSize: '12px' }
  const toggleStyle: CSSProperties = {
    display: 'inline-flex',
    border: `1px solid ${c.line}`,
    borderRadius: '6px',
    overflow: 'hidden',
  }
  const toggleButton: CSSProperties = {
    font: 'inherit',
    fontSize: 12,
    padding: '4px 14px',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: c.primary,
  }
  const toggleActive: CSSProperties = { background: c.primary, color: '#fff' }
  const editButton: CSSProperties = {
    font: 'inherit',
    fontSize: 12,
    padding: '4px 14px',
    cursor: 'pointer',
    border: `1px solid ${c.line}`,
    borderRadius: '6px',
    background: 'transparent',
    color: c.primary,
  }
  const input: CSSProperties = {
    font: 'inherit',
    fontSize: 12,
    padding: '2px 6px',
    border: `1px solid ${c.line}`,
    borderRadius: '4px',
    background: c.bandB,
    color: c.ink,
    colorScheme: theme,
    width: '100%',
    boxSizing: 'border-box',
  }

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
    if (next !== undefined) {
      setState(next)
      setEditMode(false)
      setDraft(undefined)
    } else {
      // Save failed — revert to the persisted state but keep the draft open.
      const current = await fetchProjectState(sessionId)
      if (current !== undefined) setState(current)
    }
  }

  const draftInvalid = draft !== undefined && draft.some((row) => row.start > row.end)

  const handleCommit = async (updates: TaskDateUpdate[]): Promise<void> => {
    if (!sessionId) return
    const next = await updateProjectTimeline(sessionId, updates)
    if (next !== undefined) setState(next)
  }

  return (
    <div style={WRAP}>
      <h2 style={{ margin: '0 0 12px', fontSize: '17px', color: c.primary }}>Project management</h2>

      {!loaded && <p style={ROW}>Loading…</p>}
      {error !== undefined && <p style={ROW}>{error}</p>}

      {loaded && error === undefined && state === undefined && (
        <p style={ROW}>
          No project in this workspace yet. Ask the agent to run the project interview, then
          generate a timeline (pm_timeline_generate) and export it (pm_timeline_export).
        </p>
      )}

      {loaded && error === undefined && state !== undefined && (
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: c.ink }}>{state.definition.name}</h3>
          {state.definition.description !== undefined && <p style={muted}>{state.definition.description}</p>}
          <p style={muted}>Updated {new Date(state.updatedAt).toLocaleString()}</p>

          {timeline !== undefined && (
            <div>
              {!editMode && (
                <div style={{ display: 'flex', gap: '8px', margin: '0 0 10px' }}>
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
                  <button type="button" style={editButton} onClick={beginEdit}>
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
                      color: c.muted,
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
                        style={input}
                      />
                      <input
                        type="date"
                        value={row.start}
                        onChange={(e) => setDraft((prev) => prev?.map((r) => r.id === row.id ? { ...r, start: e.target.value } : r))}
                        style={input}
                      />
                      <input
                        type="date"
                        value={row.end}
                        onChange={(e) => setDraft((prev) => prev?.map((r) => r.id === row.id ? { ...r, end: e.target.value } : r))}
                        style={input}
                      />
                      <input
                        type="text"
                        value={row.owner}
                        onChange={(e) => setDraft((prev) => prev?.map((r) => r.id === row.id ? { ...r, owner: e.target.value } : r))}
                        style={input}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      type="button"
                      disabled={saving || draftInvalid}
                      onClick={() => void saveDraft()}
                      style={{ ...editButton, background: c.primary, color: '#fff', borderColor: c.primary }}
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
                      style={editButton}
                    >
                      Cancel
                    </button>
                    {draftInvalid && (
                      <span style={{ color: c.danger, fontSize: 11, alignSelf: 'center' }}>
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
                        color: timeline.feasible ? c.success : c.danger,
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
                      <strong style={{ color: c.danger }}>Conflicts:</strong>
                      <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                        {timeline.conflicts.map((conflict) => (
                          <li key={conflict} style={{ color: c.danger }}>{conflict}</li>
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

          <p style={{ ...muted, marginTop: '12px' }}>
            Re-run the interview or adjust the timeline in chat; the pane reads the saved
            data/project_management/project_data.json.
          </p>
        </div>
      )}
    </div>
  )
}
