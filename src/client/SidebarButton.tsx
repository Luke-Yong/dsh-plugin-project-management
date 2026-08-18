import { useSyncExternalStore, type CSSProperties, type ReactElement } from 'react'
import { isPaneOpen, setPaneOpen, subscribePaneOpen } from './store.js'

const BUTTON_BASE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 8px',
  border: 'none',
  borderRadius: '6px',
  background: 'transparent',
  color: 'inherit',
  fontSize: '12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

/**
 * Rail section-header button rendered into the `sidebar.workspaces.header.actions`
 * slot (declared by the ui-workspace harness patch). Toggles the project
 * management pane dock in the composer.
 */
export function SidebarButton(): ReactElement {
  const open = useSyncExternalStore(subscribePaneOpen, isPaneOpen)
  return (
    <button
      type="button"
      onClick={() => setPaneOpen(!open)}
      title={open ? 'Hide project management' : 'Show project management'}
      aria-pressed={open}
      style={{ ...BUTTON_BASE, background: open ? 'rgba(225, 37, 27, 0.12)' : undefined }}
    >
      <span role="img" aria-hidden="true">🗓</span>
      <span>Project</span>
    </button>
  )
}
