import type { ToolRunContext } from '@deepseek-ai/dsh-tools'

/**
 * Workspace resolution helpers. A session does not always carry a `cwd` in
 * its header (e.g. blank/pre-workspace sessions), so the plugin resolves the
 * workspace directory through three sources, in order:
 *
 * 1. the executing session's header `cwd` (exact session workspace);
 * 2. the durable workspace registry (`ctx.workspaceRegistry`) by session id;
 * 3. `process.cwd()` as a last resort.
 */

/** Structural view of the durable workspace registry (`ctx.workspaceRegistry`). */
export interface WorkspaceRegistryLike {
  list(): readonly { id: string; path: string; sessionIds: readonly string[] }[]
}

/** Find the workspace path a session is attached to, if any. */
export function resolveWorkspacePath(
  registry: WorkspaceRegistryLike | undefined,
  sessionId: string | undefined,
): string | undefined {
  if (registry === undefined || sessionId === undefined) return undefined
  return registry.list().find((workspace) => workspace.sessionIds.includes(sessionId))?.path
}

/** Resolve the workspace directory for a tool execution. */
export function resolveCwdFromExecution(
  exec: ToolRunContext,
  registry: WorkspaceRegistryLike | undefined,
): string | undefined {
  const headerCwd = exec.agent?.session?.header?.cwd
  if (headerCwd !== undefined && headerCwd !== '') return headerCwd
  const agentId = (exec.agent as { id?: string } | undefined)?.id
  return resolveWorkspacePath(registry, agentId)
}

/** Resolve the workspace directory for a session id (web route / reminder). */
export function resolveCwdForSession(
  registry: WorkspaceRegistryLike | undefined,
  sessionId: string | undefined,
): string | undefined {
  if (sessionId === undefined) return undefined
  return resolveWorkspacePath(registry, sessionId)
}
