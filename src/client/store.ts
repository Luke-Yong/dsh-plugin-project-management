/**
 * Module-scoped pane visibility. Cross-component state shared between the
 * rail button and the composer dock, independent of the slot system.
 */
let open = false
const listeners = new Set<() => void>()

export function isPaneOpen(): boolean {
  return open
}

export function setPaneOpen(value: boolean): void {
  if (open === value) return
  open = value
  for (const listener of listeners) listener()
}

export function subscribePaneOpen(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
