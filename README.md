# dsh-plugin-project-management

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that
interviews the user about a project, generates a project timeline / Gantt chart,
and exports it as **Word** or **Excel**.

The agent owns the loop: it runs a structured interview (via the
`project-interview` skill), decomposes features into tasks, and uses four tools
to validate, schedule, adjust, and export. The scheduling math is deterministic.

## Tools

| Tool | Purpose |
|---|---|
| `pm.project.define` | Validate/normalize the interview result into a canonical `ProjectDefinition` (features, priorities, dates, milestones, agent budget per duration, constraints) |
| `pm.timeline.generate` | Deterministic scheduler: dependency-aware, workday-aware dating, critical path, deadline + budget feasibility checks |
| `pm.timeline.update` | Patch tasks (rename, dependencies, effort, agents, manual date pins) and re-schedule |
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
2. It calls `pm.project.define` to lock in the definition.
3. It decomposes features into tasks and calls `pm.timeline.generate`.
4. It reviews feasibility with you and adjusts via `pm.timeline.update`.
5. It exports with `pm.timeline.export` (`format: docx | xlsx`).

## Notes / MVP limitations

- Export paths resolve relative to the harness process cwd (`process.cwd()`),
  or use an absolute `path` argument.
- State lives in the conversation (the append-only session log is the
  persistence) — no sidecar files are written.
- Weekends (Sat/Sun) are skipped; a future version can expose a configurable
  workweek and holidays.

## Roadmap

- Custom Web UI Gantt view via `presentCall` / `presentResult`.
- Persistent `.dsh-pm/` state files keyed by session cwd.
- Drag-and-drop editing, multi-project, live agent-budget tracking.
