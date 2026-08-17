# dsh-plugin-project-management

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that
interviews the user about a project, generates a project timeline / Gantt chart,
and exports it as **Word** or **Excel**.

The agent owns the loop: it runs a structured interview (via the
`project-interview` skill), decomposes features into tasks, and uses five tools
to validate, schedule, adjust, persist, and export. The scheduling math is
deterministic. The project (definition + timeline) is persisted to a workspace
project file (`.dsh-pm/project.json`) so it survives across sessions, and the
plugin reminds the agent about an existing timeline on session resume.

## Tools

| Tool | Purpose |
|---|---|
| `pm.project.define` | Validate/normalize the interview result into a canonical `ProjectDefinition` (features, priorities, dates, milestones, agent budget per duration, constraints); persists it |
| `pm.timeline.generate` | Deterministic scheduler: dependency-aware, workday-aware dating, critical path, deadline + budget feasibility checks; persists definition + timeline |
| `pm.timeline.update` | Patch tasks (rename, dependencies, effort, agents, manual date pins), re-schedule, and persist |
| `pm.project.load` | Load the saved project (definition + timeline) from `.dsh-pm/project.json` — use when resuming a session |
| `pm.timeline.export` | Write `.docx` (summary, task schedule, milestones, budget) or `.xlsx` (Summary, Tasks, colored Gantt sheet) |

## Skill

- `project-interview` — the conversational interview protocol: features →
  priorities → timeline/milestones → **agent budget per duration** (hours /
  cost / agents / custom, with a period) → constraints.

## Install

Build the plugin, then load it with a Cordis overlay patch:

```sh
npm install
npm run build
```

From a DeepSeek Harness checkout:

```sh
pnpm dsh web --patch /absolute/path/to/dsh-plugin-project-management/cordis.yml
```

Open `http://127.0.0.1:3080` and ask, for example:

> Plan a timeline for my mobile app and export it as both Word and Excel.

## Flow

1. The agent interviews you (features, deadline, milestones, agent budget per
   duration).
2. It calls `pm.project.define` to lock in and persist the definition.
3. It decomposes features into tasks and calls `pm.timeline.generate`.
4. It reviews feasibility with you and adjusts via `pm.timeline.update`.
5. It exports with `pm.timeline.export` (`format: docx | xlsx`).

## Persistence & session resume

- The definition and timeline are saved to `<workspace>/.dsh-pm/project.json`
  (the workspace is the session `cwd`).
- On a new session in the same workspace, the plugin injects a reminder into
  the model context when a timeline exists, telling the agent about the saved
  plan and its conflicts; the agent then calls `pm.project.load` to continue.
- Writes are atomic (temp file + rename).

## Notes / MVP limitations

- A single project per workspace.
- Weekends (Sat/Sun) are skipped; a future version can expose a configurable
  workweek and holidays.

## Roadmap

- Custom Web UI Gantt view via `presentCall` / `presentResult`.
- Multi-project and live agent-budget tracking.
