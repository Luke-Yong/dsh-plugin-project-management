import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadProject } from './state.js'
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

/**
 * Register `GET /plugins/project-management/state?session=<id>` (or
 * `?path=<abs dir>`). The pane fetches this from the browser; the server
 * resolves the session cwd and reads `.dsh-pm/project.json`. Returns the
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
      const url = new URL(req.url ?? '/', 'http://localhost')
      const sessionId = url.searchParams.get('session')
      const pathParam = url.searchParams.get('path')

      // Workspace resolution order: session header cwd → workspace registry → path param.
      let cwd: string | undefined
      if (sessionId !== null && options.sessions !== undefined) {
        const headerCwd = options.sessions.get(sessionId)?.header?.cwd
        if (headerCwd !== undefined && headerCwd !== '') cwd = headerCwd
      }
      if (cwd === undefined && sessionId !== null) {
        cwd = resolveCwdForSession(options.workspaceRegistry, sessionId)
      }
      if (cwd === undefined && pathParam !== null) cwd = pathParam

      if (cwd === undefined) {
        res.writeHead(sessionId !== null ? 404 : 400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          error: sessionId !== null ? 'unknown session' : 'provide a session id or a path',
          sessionId: sessionId ?? undefined,
        }))
        return
      }
      const state = await loadProject(cwd)
      if (state === undefined) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'no project in workspace', cwd }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(state))
    },
  })
}
