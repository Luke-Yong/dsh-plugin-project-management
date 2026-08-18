import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadProject, saveProject, type ProjectState } from './state.js'
import { schedule, type TaskInput } from './scheduler.js'
import { resolveCwdForSession, type WorkspaceRegistryLike } from './workspace.js'

/** Structural view of `ctx.webServer` (optional service). */
export interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** Structural view of the session store (`ctx.sessions`, optional). */
export interface SessionStoreLike {
  get(id: string): { header?: { cwd?: string } } | undefined
}

export interface ProjectStateRouteOptions {
  sessions?: SessionStoreLike
  /** Durable workspace registry (`ctx.workspaceRegistry`), for sessions without a header cwd. */
  workspaceRegistry?: WorkspaceRegistryLike
}

/** Absolute pathname of the project-state read route. */
export const PROJECT_STATE_ROUTE = '/plugins/project-management/state'

/** Absolute pathname of the project-timeline update route (POST). */
export const PROJECT_TIMELINE_ROUTE = '/plugins/project-management/timeline'

/**
 * Workspace resolution order for web routes: session header cwd →
 * workspace registry → `path` query param.
 */
function resolveCwd(url: URL, options: ProjectStateRouteOptions): { cwd?: string; sessionId: string | null } {
  const sessionId = url.searchParams.get('session')
  const pathParam = url.searchParams.get('path')
  let cwd: string | undefined
  if (sessionId !== null && options.sessions !== undefined) {
    const headerCwd = options.sessions.get(sessionId)?.header?.cwd
    if (headerCwd !== undefined && headerCwd !== '') cwd = headerCwd
  }
  if (cwd === undefined && sessionId !== null) {
    cwd = resolveCwdForSession(options.workspaceRegistry, sessionId)
  }
  if (cwd === undefined && pathParam !== null) cwd = pathParam
  return { cwd, sessionId }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer | string) => {
      data += chunk.toString('utf8')
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/**
 * Register `GET /plugins/project-management/state?session=<id>` (or
 * `?path=<abs dir>`). The pane fetches this from the browser; the server
 * resolves the session cwd and reads the saved project data. Returns the
 * route disposer.
 */
export function registerProjectStateRoute(
  webServer: WebServerLike,
  options: ProjectStateRouteOptions = {},
): () => void {
  return webServer.register({
    kind: 'exact',
    path: PROJECT_STATE_ROUTE,
    handler: async (req, res) => {
      if (req.method !== undefined && req.method !== 'GET' && req.method !== 'HEAD') {
        writeJson(res, 405, { error: 'method not allowed' })
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const { cwd, sessionId } = resolveCwd(url, options)
      if (cwd === undefined) {
        writeJson(res, sessionId !== null ? 404 : 400, {
          error: sessionId !== null ? 'unknown session' : 'provide a session id or a path',
          sessionId: sessionId ?? undefined,
        })
        return
      }
      const state = await loadProject(cwd)
      if (state === undefined) {
        writeJson(res, 404, { error: 'no project in workspace', cwd })
        return
      }
      writeJson(res, 200, state)
    },
  })
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

interface TaskUpdate {
  id: string
  start?: string
  end?: string
  name?: string
  owner?: string
}

/** Validate the POST body into a task update list, or `undefined` when malformed. */
function parseTaskUpdates(payload: unknown): TaskUpdate[] | undefined {
  if (payload === null || typeof payload !== 'object') return undefined
  const list = (payload as { updates?: unknown }).updates
  if (!Array.isArray(list) || list.length === 0) return undefined
  const out: TaskUpdate[] = []
  for (const raw of list) {
    if (raw === null || typeof raw !== 'object') return undefined
    const item = raw as Record<string, unknown>
    if (typeof item.id !== 'string' || item.id === '') return undefined
    const update: TaskUpdate = { id: item.id }
    for (const key of ['start', 'end'] as const) {
      if (item[key] !== undefined) {
        if (typeof item[key] !== 'string' || !ISO_DATE.test(item[key] as string)) return undefined
        update[key] = item[key] as string
      }
    }
    for (const key of ['name', 'owner'] as const) {
      if (item[key] !== undefined) {
        if (typeof item[key] !== 'string') return undefined
        update[key] = item[key]
      }
    }
    out.push(update)
  }
  return out
}

/**
 * Register `POST /plugins/project-management/timeline?session=<id>` (or
 * `?path=<abs dir>`). Body: `{ "updates": [{ "id": "T3", "start": "...",
 * "end": "..." }] }`. The server applies the changes as pinned dates,
 * re-schedules (critical path / feasibility / phases recomputed), persists to
 * the project data file and returns the new state. Returns the route disposer.
 */
export function registerProjectTimelineUpdateRoute(
  webServer: WebServerLike,
  options: ProjectStateRouteOptions = {},
): () => void {
  return webServer.register({
    kind: 'exact',
    path: PROJECT_TIMELINE_ROUTE,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { error: 'method not allowed' })
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const { cwd, sessionId } = resolveCwd(url, options)
      if (cwd === undefined) {
        writeJson(res, sessionId !== null ? 404 : 400, {
          error: sessionId !== null ? 'unknown session' : 'provide a session id or a path',
          sessionId: sessionId ?? undefined,
        })
        return
      }
      const state = await loadProject(cwd)
      if (state === undefined || state.timeline === undefined) {
        writeJson(res, 404, { error: 'no project timeline in workspace', cwd })
        return
      }

      let payload: unknown
      try {
        payload = JSON.parse(await readBody(req))
      } catch {
        writeJson(res, 400, { error: 'invalid JSON body' })
        return
      }
      const updates = parseTaskUpdates(payload)
      if (updates === undefined) {
        writeJson(res, 400, { error: 'expected {"updates": [{id, start?, end?, name?, owner?}]}' })
        return
      }

      // Rebuild the scheduler input with every current date pinned, then apply
      // the user overrides — the timeline only changes where the user moved it.
      const byId = new Map<string, TaskInput>()
      for (const task of state.timeline.tasks) {
        const input: TaskInput = {
          id: task.id,
          name: task.name,
          phase: task.phase,
          dependsOn: task.dependsOn,
          effortDays: task.effortDays,
          agents: task.agents,
          tier: task.tier,
          owner: task.owner,
          pinnedStart: task.start,
          pinnedEnd: task.end,
        }
        byId.set(task.id, input)
      }
      for (const update of updates) {
        const input = byId.get(update.id)
        if (input === undefined) {
          writeJson(res, 400, { error: `unknown task "${update.id}"` })
          return
        }
        if (update.name !== undefined) input.name = update.name
        if (update.owner !== undefined) input.owner = update.owner
        if (update.start !== undefined) input.pinnedStart = update.start
        if (update.end !== undefined) input.pinnedEnd = update.end
        if (input.pinnedStart !== undefined && input.pinnedEnd !== undefined && input.pinnedStart > input.pinnedEnd) {
          writeJson(res, 400, { error: `task "${update.id}" start is after its end` })
          return
        }
      }

      const timeline = schedule(state.definition, [...byId.values()])
      const updated: ProjectState = {
        ...state,
        timeline,
        updatedAt: new Date().toISOString(),
      }
      await saveProject(cwd, updated)
      writeJson(res, 200, updated)
    },
  })
}
