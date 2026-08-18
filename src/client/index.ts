/**
 * Browser half of dsh-plugin-project-management.
 *
 * Registers two surfaces:
 * - `conversation.view` — a "Project" tab in the conversation header's view
 *   tabs (the same mechanism ui-trajectory uses). Note: the view-tab ring
 *   only renders once a session is active (>= 1 turn).
 * - `conversation.input.dock` — a compact project dock inside the composer
 *   stack, which renders even for blank/0-turn sessions, so the saved project
 *   is reachable before the tabs appear.
 */
import type { ClientContextLike } from './contracts.js'
import { ProjectDock } from './ProjectDock.js'
import { ProjectManagementView } from './ProjectManagementView.js'

/** Required services (cordis fiber inject). */
export const inject = ['slots']

export function apply(ctx: ClientContextLike): void {
  // Full project management view as a conversation tab.
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'project-management',
    // Tab order: chat = 0, trajectory = 10; the Project tab follows them.
    order: 20,
    label: () => 'Project',
    inject: (sessionId) => ({ sessionId }),
  }, ProjectManagementView))

  // Compact dock in the composer (visible from the first turn, auto-shows
  // when a project exists).
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'project-management',
    order: 10,
    inject: (sessionId) => ({ sessionId }),
  }, ProjectDock))
}
