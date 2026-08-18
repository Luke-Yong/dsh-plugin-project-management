# Harness patch: `sidebar.workspaces.header.actions` slot

The rail section header is internal to `@deepseek-ai/dsh-client-ui-workspace`
(`WorkspaceBrowser`), so the project button needs a slot it can render into.
This patch declares `sidebar.workspaces.header.actions` (a root-scoped list
slot) and renders it in the section header. It targets the deepseek-harness
checkout at `master` (2026-08) — line numbers may drift; the anchors below are
searchable.

Two files in `packages/client/ui-workspace/src/client/`:

## 1. `index.ts` — declare the child slot

Find the `sidebar.workspaces` registration (search for
`ctx.slots.inject('sidebar.workspaces'`). It currently reads:

```ts
ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
  {
    name: 'sidebar.workspaces',
    children: { 'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' } },
    store: createWorkspaceViewStore(),
    inject: browserInjected,
    locale: NS,
  },
  WorkspaceBrowser,
))
```

Change the `children` map to add the header-actions list slot:

```ts
    children: {
      'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' },
      'sidebar.workspaces.header.actions': { kind: 'list', scope: 'root' },
    },
```

## 2. `WorkspaceBrowser.tsx` — render the slot in the section header

`WorkspaceBrowser` receives the render-slots share through its composed props
(it already renders its `directoryFlow` child hole). Find the section header
row — the one holding the search / view / add actions (search for the header
element whose siblings include the collapsed search trigger). Inside that
header row, next to the existing action controls, render the new list slot:

```tsx
{renderSlot('sidebar.workspaces.header.actions')}
```

(If `renderSlot` is destructured elsewhere in the component, add it to that
destructuring; otherwise call `props.renderSlot(...)`.)

## 3. Rebuild

```sh
pnpm build            # from the harness repo root (rebuilds ui-workspace client bundle)
pnpm dsh web --patch /absolute/path/to/dsh-plugin-project-management/cordis.yml
```

After this patch the plugin's client half (see `src/client/`) registers the
rail **Project** button into `sidebar.workspaces.header.actions` and the
project management pane into `conversation.input.dock`.

> Alternative while this patch is unmerged: the harness repo may accept the
> slot upstream — see the architecture.md "UI integration points" section for
> the rationale and the slot-system standard.
