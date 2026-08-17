import type { Context } from '@deepseek-ai/cordis'
import { PROJECT_INTERVIEW_SKILL, type SkillRegistrationLike } from './skills/project-interview.js'
import { loadProjectSync, projectStatePath } from './state.js'
import {
  defineProjectTool,
  exportTimelineTool,
  generateTimelineTool,
  loadProjectTool,
  updateTimelineTool,
} from './tools.js'

export const name = 'project-management'
export const inject = ['tools']

/** The skill service (`ctx.skills`) is optional; register only when present. */
interface SkillRegistryLike {
  register(registration: SkillRegistrationLike): () => void
}

/** The system-prompt service (`ctx.systemPrompt`) is optional. */
interface SystemPromptLike {
  context(input: {
    name: string
    order: number
    text: string | ((context: unknown) => string)
  }): () => void
}

/** The agent field is added to the assembly context by dsh-agent. */
function sessionCwd(context: unknown): string | undefined {
  return (context as { agent?: { session?: { header?: { cwd?: string } } } }).agent?.session?.header?.cwd
}

/**
 * Reminder injected as dynamic model context: if the workspace has a saved
 * timeline, tell the agent about it and what to advise the user.
 */
function timelineReminder(context: unknown): string {
  const cwd = sessionCwd(context)
  if (!cwd) return ''
  const state = loadProjectSync(cwd)
  const timeline = state?.timeline
  if (!state || !timeline) return ''

  const lines = [
    'A project timeline already exists in this workspace:',
    `Project "${timeline.projectName}": ${timeline.startDate} → ${timeline.endDate} (${timeline.tasks.length} tasks).`,
    `Feasible: ${timeline.feasible ? 'yes' : 'no'}.`,
  ]
  for (const conflict of timeline.conflicts) lines.push(`Conflict: ${conflict}`)
  if (!timeline.feasible) {
    lines.push(
      'Advise the user about these conflicts and offer options (reduce scope, add agents, or extend the deadline).',
    )
  }
  lines.push(`Call pm.project.load to pull the full definition and timeline from ${projectStatePath(cwd)}.`)
  return lines.join('\n')
}

export function apply(ctx: Context) {
  for (const tool of [
    defineProjectTool,
    generateTimelineTool,
    updateTimelineTool,
    exportTimelineTool,
    loadProjectTool,
  ]) {
    ctx.tools.register(tool)
  }

  // Optional dependency: register the interview skill when the skill service
  // is mounted (standard profile includes it).
  const skills = ctx.get('skills') as SkillRegistryLike | undefined
  if (skills) {
    skills.register(PROJECT_INTERVIEW_SKILL)
  }

  // Optional dependency: remind the agent when a saved timeline exists.
  const systemPrompt = ctx.get('systemPrompt') as SystemPromptLike | undefined
  if (systemPrompt) {
    systemPrompt.context({
      name: 'project-management-timeline',
      order: 1000,
      text: (context) => timelineReminder(context),
    })
  }
}
