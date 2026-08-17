import type { Context } from '@deepseek-ai/cordis'
import { PROJECT_INTERVIEW_SKILL, type SkillRegistrationLike } from './skills/project-interview.js'
import { defineProjectTool, exportTimelineTool, generateTimelineTool, updateTimelineTool } from './tools.js'

export const name = 'project-management'
export const inject = ['tools']

/** The skill service (`ctx.skills`) is optional; register only when present. */
interface SkillRegistryLike {
  register(registration: SkillRegistrationLike): () => void
}

export function apply(ctx: Context) {
  for (const tool of [
    defineProjectTool,
    generateTimelineTool,
    updateTimelineTool,
    exportTimelineTool,
  ]) {
    ctx.tools.register(tool)
  }

  // Optional dependency: register the interview skill when the skill service
  // is mounted (standard profile includes it).
  const skills = ctx.get('skills') as SkillRegistryLike | undefined
  if (skills) {
    skills.register(PROJECT_INTERVIEW_SKILL)
  }
}
