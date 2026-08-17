# Architecture

This document describes how `dsh-plugin-project-management` works, how its
pieces fit together, and where it plugs into the DeepSeek Harness.

## Overview

The plugin lets an agent interview the user about a project and produce an
exportable timeline / Gantt chart (Word + Excel). The agent owns the loop: it
runs the conversation, decomposes features into tasks, and calls four small
tools. The scheduling math is deterministic; the model never computes dates by
hand.

```
┌──────────────────────────────────────────────────────────────┐
│ DeepSeek Harness (Cordis kernel)                              │
│  ctx.tools    ctx.skills        ctx.clientModules (future UI) │
└──────┬────────────┬───────────────────────────▲───────────────┘
       │            │                           │
┌──────▼────────────▼───────────────────────────┴───────────────┐
│ dsh-plugin-project-management                                  │
│  index.ts          → plugin entry (name / inject / apply)      │
│  skills/project-interview.ts → interview protocol (skill)      │
│  tools.ts          → 5 defineTool registrations                │
│  scheduler.ts      → deterministic scheduling engine           │
│  export.ts         → docx / xlsx builders                      │
│  state.ts          → .dsh-pm/project.json persistence          │
│  types.ts          → domain model (definition / timeline)      │
│  date.ts           → workday-aware date math                   │
└────────────────────────────────────────────────────────────────┘
```

## Plugin anatomy

- The plugin is a Cordis plugin: a TS module exporting `name`, `inject`, and
  `apply(ctx)` (see [src/index.ts](src/index.ts)).
- `inject: ['tools']` — Cordis waits for the tool registry before `apply` runs.
- The `skills` service is optional; it is consumed via `ctx.get('skills')` and
  the interview skill is only registered when present.

## Components and responsibilities

| File | Responsibility |
|---|---|
| `src/index.ts` | Registers the five tools, the interview skill, and the session-resume reminder |
| `src/tools.ts` | `defineTool` declarations: schemas, output renderers, `execute` bodies |
| `src/scheduler.ts` | Pure scheduling: dependencies, workdays, pins, critical path, feasibility |
| `src/export.ts` | Pure builders: Word (`docx`) and Excel (`exceljs`) |
| `src/state.ts` | Workspace persistence: `.dsh-pm/project.json` read/write |
| `src/types.ts` | `ProjectDefinition`, `Timeline`, `BudgetModel`, `Feature`, … |
| `src/date.ts` | ISO date math that skips weekends |
| `src/skills/project-interview.ts` | The `project-interview` skill body (markdown) |

The scheduler and exporters are **pure functions**; persistence happens in the
tools (`pm.project.define` / `pm.timeline.generate` / `pm.timeline.update`),
which write the workspace project file, and `pm.timeline.export`, which writes
the output file. Everything else has no side effects.

## Tool contracts

All tools use `defineTool` from `@deepseek-ai/dsh-tools`; `output.schema` is
`{ type: 'json' }` (lossless canonical value), and `output.render` converts the
canonical value into model-facing text that includes the full JSON the agent
needs to continue.

| Tool | Inputs | Behavior |
|---|---|---|
| `pm.project.define` | `definition` | Validates/normalizes the interview result into a canonical `ProjectDefinition`; persists it to the workspace; returns `{ definition, issues, statePath }` |
| `pm.timeline.generate` | `definition`, `tasks[]`, `hoursPerDay?` | Schedules the task breakdown; persists definition + timeline; returns `{ timeline, statePath }` |
| `pm.timeline.update` | `timeline`, `patches[]`, `definition?` | Applies patches (rename, deps, effort, agents, manual pins), re-schedules, persists; returns `{ timeline, skippedIds, statePath }` |
| `pm.project.load` | `cwd?` | Loads the saved project state; returns `{ state, loaded }` — the resume entry point |
| `pm.timeline.export` | `format`, `definition`, `timeline`, `path?` | Writes `.docx` or `.xlsx` and returns the absolute output path |

## Data model

### ProjectDefinition (produced by the interview)

```
ProjectDefinition
├── name, description
├── startDate / deadline        (ISO dates, optional)
├── milestones[]                (fixed dates)
├── budgetModel                 (agent budget per duration)
│   ├── kind: hours | cost | agents | custom
│   └── allocations[]: { period, amount, note }
├── features[]                  (id, title, priority, phase, effortDays, dependsOn)
├── constraints[] / notes
```

The budget model is intentionally open: the interview decides how the user
expresses it (hours per week, cost per month, parallel agents per phase, or a
custom unit). The scheduler only interprets it when the unit is unambiguous
(`hours` per `week`).

### Timeline (produced by the scheduler)

```
Timeline
├── startDate / endDate / deadline
├── feasible / conflicts[]      (deadline + budget feasibility)
├── criticalPath[]              (task ids)
├── tasks[]                     (id, phase, deps, effortDays, agents, start, end, critical, pinned)
├── phases[]                    (phase windows)
├── milestones[]                (phase completions + explicit milestones)
└── hoursPerDay
```

## Scheduler algorithm (`src/scheduler.ts`)

1. **Reference checks** — unknown dependency ids are reported as conflicts.
2. **Pins first** — tasks with explicit `pinnedStart`/`pinnedEnd` resolve first
   so dependents can anchor on them.
3. **Topological resolution** — Kahn-style forward pass. A task starts on the
   workday after its latest dependency ends (or at the project start); its end
   is `start + ceil(effortDays / agents) - 1` workdays. Unresolvable tasks are
   dependency cycles and become conflicts.
4. **Critical path** — backward pass over the resolution order: a follower's
   latest start is its latest end minus its workday duration; a predecessor's
   latest end is the workday before the earliest follower start. Tasks with
   zero slack (`actualEnd == latestEnd`) are critical.
5. **Feasibility** — timeline end after the deadline → conflict. For
   `hours` budgets: per-week effort (`effortHours / spanDays * 7`) is compared
   against the weekly allocation; non-week periods fall back to a total check.

Weekends (Sat/Sun) are skipped everywhere; the workweek is not yet configurable.

## Export pipeline (`src/export.ts`)

Both builders consume the same `definition` + `timeline`:

- **Word** (`docx`): title + summary, constraints, task schedule table
  (ID / phase / task / deps / effort / agents / start / end / critical),
  milestones table, and an agent-budget section.
- **Excel** (`exceljs`): a `Summary` sheet (key-value + conflicts), a `Tasks`
  sheet (same columns as Word), and a `Gantt` sheet — one column per workday,
  one row per task, with phase-colored bar cells and gold milestone markers.

`pm.timeline.export` resolves relative paths against the harness process cwd
(`process.cwd()`) and writes the file with `node:fs/promises`.

## Interview flow (agent-owned)

The `project-interview` skill gives the agent the protocol — one question at a
time: features → priorities → timeline/milestones → **agent budget per
duration** → constraints. When the definition is complete the agent calls
`pm.project.define`, decomposes features into tasks, calls
`pm.timeline.generate`, reviews feasibility with the user, adjusts via
`pm.timeline.update`, then exports via `pm.timeline.export`.

## Storage model

**The timeline is stored in a workspace project file: `<cwd>/.dsh-pm/project.json`.**

- The workspace directory is resolved from the executing agent's session
  (`agent.session.header.cwd`, set when the session was created), falling back
  to `process.cwd()` for headless/direct calls.
- `pm.project.define` writes the definition; `pm.timeline.generate` and
  `pm.timeline.update` write the definition + timeline. Writes are atomic
  (write-to-temp then rename).
- The file survives across sessions: a new session in the same workspace can
  call `pm.project.load` to pull the definition and timeline back into the
  conversation.
- The harness session log remains the record of *what the model did* (every
  tool call, argument, and result); the project file is the record of *what the
  project is* (the current canonical state). They complement each other.

## Session resume reminder

`src/index.ts` registers a dynamic prompt context
(`ctx.systemPrompt.context`, name `project-management-timeline`) if the
system-prompt service is available. On every prompt assembly it resolves the
session `cwd`, reads `.dsh-pm/project.json` (synchronously, best-effort), and
if a **timeline exists** it injects a short user-role reminder:

- project name, span, task count, and feasibility;
- each open conflict;
- an instruction to advise the user about conflicts (reduce scope / add agents
  / extend the deadline);
- a pointer to `pm.project.load` to continue the saved plan.

If no timeline exists (or no cwd is available) the provider returns empty text
and nothing is injected. Because the harness materializes prompt contexts as
durable snapshots only when they change, the reminder is not re-injected on
every turn.

## UI integration points (where a Gantt UI would render)

Two distinct places, depending on how the Gantt is built:

1. **Tool-result presenters (inline cards).** `defineTool` supports
   `presentCall` / `presentResult` / `presentationMeta`, which render
   `ToolCallView` / `ToolResultView` cards wherever a tool call's result is
   shown in the agent console / trajectory. A lightweight Gantt (e.g. an SVG
   preview) would appear **inline in the conversation**, immediately under the
   `pm.timeline.generate` / `update` / `export` calls that produced it.
   Presenters must be pure, side-effect-free, and replayable — so the Gantt
   must be derived from the canonical value, not from live state.

2. **Web client module (app-level view).** A package can declare
   `dsh.client: { platform: 'web' }` in `package.json` and export a bundle at
   `exports["./client"]`; the harness serves it at `/plugins/<id>/client.js`
   and mounts it into the web app via the `window.__DSH_BOOT__` boot graph
   (`ctx.clientModules`). This is where a **dedicated, interactive Gantt
   panel/route in the web UI** would live (e.g. drag-to-reschedule), and where
   it can share data with the tools through a plugin service.

Recommended path: ship the inline presenter first (zero app changes, appears in
every session automatically), then add the client module for an interactive
editor when the data model stabilizes.

## Known limitations / roadmap

- A single project per workspace (one `.dsh-pm/project.json`).
- Weekend-only workweek; no holidays or configurable calendar.
- No custom Gantt UI yet (see integration points above).
- Multi-project and live agent-budget tracking are out of scope for the MVP.
