export type InventoryHit =
  | {
      kind: "sector-seat"
      sectorId: string
      seatId: string
      seatKey: string
    }
  | {
      kind: "element-seat"
      elementId: string
      seatId: string
    }
  | {
      kind: "element"
      elementId: string
    }

type AttrNode = {
  getAttribute: (name: string) => string | null
  closest?: (selector: string) => AttrNode | null
}

function isAttrNode(node: unknown): node is AttrNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "getAttribute" in node &&
    typeof (node as AttrNode).getAttribute === "function"
  )
}

function readInventoryHit(node: AttrNode): InventoryHit | null {
  const inventory = node.getAttribute("data-inventory")
  if (inventory === "sector-seat") {
    const sectorId = node.getAttribute("data-sector-id")
    const seatId = node.getAttribute("data-seat-id")
    if (!sectorId || !seatId) return null
    return {
      kind: "sector-seat",
      sectorId,
      seatId,
      seatKey: node.getAttribute("data-seat-key") || `${sectorId}::${seatId}`,
    }
  }
  if (inventory === "element-seat") {
    const elementId = node.getAttribute("data-element-id")
    const seatId = node.getAttribute("data-seat-id")
    if (!elementId || !seatId) return null
    return { kind: "element-seat", elementId, seatId }
  }
  if (inventory === "element") {
    const elementId = node.getAttribute("data-element-id")
    if (!elementId) return null
    return { kind: "element", elementId }
  }
  return null
}

/**
 * `node` es `unknown` a proposito: `isAttrNode` es un type guard en runtime y
 * lo unico que se lee son data attributes. Pedir un `EventTarget` obligaria a
 * cada caller a construir un nodo DOM completo sin que la funcion lo use.
 */
export function inventoryHitFromNode(node: unknown): InventoryHit | null {
  if (!isAttrNode(node)) return null
  const direct = readInventoryHit(node)
  if (direct) return direct
  if (!node.closest) return null
  const ancestor = node.closest("[data-inventory]")
  return ancestor ? readInventoryHit(ancestor) : null
}

export function inventoryHitFromEvent(event: {
  target?: unknown
  composedPath?: () => unknown[]
}): InventoryHit | null {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : []
  for (const node of path) {
    if (!isAttrNode(node)) continue
    const hit = readInventoryHit(node)
    if (hit) return hit
  }
  return inventoryHitFromNode(event.target ?? null)
}
