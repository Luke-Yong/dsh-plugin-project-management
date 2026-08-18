/**
 * Browser half of dsh-plugin-project-management.
 *
 * Registers into two slots:
 * - `sidebar.workspaces.header.actions` — the rail section-header button
 *   (slot declared by the ui-workspace harness patch, see patches/).
 * - `conversation.input.dock` — the project management pane inside the
 *   composer stack (declared by ui-conversation; order 10 sits between the
 *   todo strip at 0 and the queue at 20).
 */
import type { ClientContextLike } from './contracts.js'
import { ProjectPane } from './ProjectPane.js'
import { SidebarButton } from './SidebarButton.js'

/** Required services (cordis fiber inject). */
export const inject = ['slots']

export function apply(ctx: ClientContextLike): void {
  // Rail section-header button. `slots.inject` defers to the slot declaration
  // lifetime, so it survives the ui-workspace patch being mounted at any order.
  ctx.slots.inject('sidebar.workspaces.header.actions', () => ctx.slots.register({
    name: 'sidebar.workspaces.header.actions',
    order: 0,
  }, SidebarButton))

  // Composer dock (project management pane). The inject factory receives the
  // current session id; the pane fetches the saved project state for it.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    order: 10,
    inject: (sessionId) => ({ sessionId }),
  }, ProjectPane))
}
