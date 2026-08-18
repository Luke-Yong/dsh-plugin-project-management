/**
 * Browser half of dsh-plugin-project-management.
 *
 * Registers one entry into the `conversation.view` slot (ui-conversation's
 * conversation-header view tabs — the same mechanism ui-trajectory uses for
 * its tab). Selecting the "Project" tab renders the project management pane.
 */
import type { ClientContextLike } from './contracts.js'
import { ProjectManagementView } from './ProjectManagementView.js'

/** Required services (cordis fiber inject). */
export const inject = ['slots']

export function apply(ctx: ClientContextLike): void {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'project-management',
    // Tab order: chat = 0, trajectory = 10; the Project tab follows them.
    order: 20,
    label: () => 'Project',
    inject: (sessionId) => ({ sessionId }),
  }, ProjectManagementView))
}
