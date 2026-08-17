import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ProjectDefinition, Timeline } from './types.js'

/** Durable per-workspace project record stored in `<cwd>/.dsh-pm/project.json`. */
export interface ProjectState {
  definition: ProjectDefinition
  timeline?: Timeline
  updatedAt: string
}

/** Absolute path of the project state file for a workspace directory. */
export function projectStatePath(cwd: string): string {
  return join(cwd, '.dsh-pm', 'project.json')
}

/** Read the project state file, or `undefined` when absent or malformed. */
export async function loadProject(cwd: string): Promise<ProjectState | undefined> {
  try {
    const text = await readFile(projectStatePath(cwd), 'utf8')
    return JSON.parse(text) as ProjectState
  } catch {
    return undefined
  }
}

/** Synchronous variant used by prompt providers (small file, best-effort). */
export function loadProjectSync(cwd: string): ProjectState | undefined {
  try {
    const text = readFileSync(projectStatePath(cwd), 'utf8')
    return JSON.parse(text) as ProjectState
  } catch {
    return undefined
  }
}

/** Write the project state file atomically; returns the absolute path. */
export async function saveProject(cwd: string, state: ProjectState): Promise<string> {
  const path = projectStatePath(cwd)
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
  await rename(tmp, path)
  return path
}
