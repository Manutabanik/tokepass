export type InertLikeNode = {
  contains(node: unknown): boolean
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  removeAttribute(name: string): void
  inert?: boolean
}

export function nodeHidesActiveDescendant(
  node: InertLikeNode,
  active: unknown,
) {
  if (active == null || !node.contains(active)) return false
  return (
    node.getAttribute("aria-hidden") === "true" ||
    node.hasAttribute("data-base-ui-inert") ||
    node.hasAttribute("inert") ||
    node.inert === true
  )
}

export function releaseHiddenFocusAncestorLike(
  node: InertLikeNode,
  active: unknown,
) {
  if (!nodeHidesActiveDescendant(node, active)) return false
  node.removeAttribute("aria-hidden")
  node.removeAttribute("data-base-ui-inert")
  node.removeAttribute("inert")
  node.inert = false
  return true
}

/** Drop keyboard/pointer focus so overlays can hide ancestors without the Chrome aria-hidden block. */
export function blurActiveElement() {
  const active =
    typeof document === "undefined" ? null : document.activeElement
  if (!(active instanceof HTMLElement) || active === document.body) return
  active.blur()
}

export function ancestorHidesFocusedDescendant(node: HTMLElement | null) {
  if (!node || typeof document === "undefined") return false
  return nodeHidesActiveDescendant(node, document.activeElement)
}

/** Undo Base UI hide/inert on a chrome root that still holds focus (Herramientas, etc.). */
export function releaseHiddenFocusAncestor(node: HTMLElement | null) {
  if (!node || typeof document === "undefined") return false
  return releaseHiddenFocusAncestorLike(node, document.activeElement)
}
