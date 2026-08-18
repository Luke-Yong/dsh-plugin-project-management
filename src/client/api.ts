import type { ProjectStateWire, TaskDateUpdate } from './contracts.js'

const STATE_ROUTE = '/plugins/project-management/state'
const TIMELINE_ROUTE = '/plugins/project-management/timeline'

/** Read the saved project state for a session (or `undefined` when absent). */
export async function fetchProjectState(sessionId: string): Promise<ProjectStateWire | undefined> {
  const res = await fetch(`${STATE_ROUTE}?session=${encodeURIComponent(sessionId)}`)
  if (!res.ok) return undefined
  return (await res.json()) as ProjectStateWire
}

/**
 * Apply manual timeline adjustments. The server re-schedules with the
 * changed dates pinned and persists to the project data file; the response is
 * the fresh state (or `undefined` on failure).
 */
export async function updateProjectTimeline(
  sessionId: string,
  updates: TaskDateUpdate[],
): Promise<ProjectStateWire | undefined> {
  const res = await fetch(`${TIMELINE_ROUTE}?session=${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ updates }),
  })
  if (!res.ok) return undefined
  return (await res.json()) as ProjectStateWire
}
