# Contributing to dsh-plugin-project-management

Thanks for your interest in contributing! Please read this guide before opening
an issue or pull request.

## Project layout

- `src/` — TypeScript server half (tools + skill logic).
  - `src/skills/project-interview.ts` — the interview protocol.
  - `src/tools.ts` — `pm_*` tool registrations.
  - `src/scheduler.ts` — deterministic scheduling math (dependency-aware,
    workday-aware, critical path).
  - `src/export.ts` — Word / Excel export.
  - `src/date.ts`, `src/types.ts` — date helpers and shared types.
- `dist/` — build output (gitignored).
- `cordis.yml` — overlay that loads the compiled plugin into a DeepSeek Harness
  checkout.

## Development setup

```sh
npm install
npm run build      # tsc server → dist/
```

Load the plugin into a DeepSeek Harness checkout:

```sh
pnpm dsh web --patch /absolute/path/to/dsh-plugin-project-management/cordis.yml
```

Open `http://127.0.0.1:3080` and drive the flow end to end (interview →
define → timeline → update → export).

## Before submitting

- `npm run typecheck` must pass (runs `tsc --noEmit`).
- Keep the scheduling math deterministic. If you change the scheduler, verify
  the critical-path and feasibility outputs on a few scenarios and note the
  behavior change in the PR description.
- The exported Word/Excel files are part of the product surface — if you change
  `src/export.ts`, verify both formats open correctly.
- Update `README.md` if you change tools, the skill, or the install flow.
- Keep the persistence schema (`data/project_management/project_data.json`)
  backward compatible, or document the migration.

## Commit style

- Follow the existing commit style in the repository history.
- One logical change per commit; describe the *why* in the message body when
  it isn't obvious.

## Pull requests

1. Fork the repo and create a branch: `git checkout -b feat/my-change`.
2. Make your changes, keeping them focused and minimal.
3. Run the checks above.
4. Open a PR against `main` with a clear title and description.

## Code of conduct

All participants are expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior to
the maintainers.
