"use client"

import { useMemo, useState } from "react"
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react"

import {
  elementBelongsToZone,
  seatBelongsToZone,
} from "@/lib/seating/venue-map-lod"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { InteractiveVenueMap } from "@/types/venue-map"

export type LayerTreeSelection =
  | { kind: "stage" }
  | { kind: "sector"; id: string }
  | { kind: "label"; id: string }
  | { kind: "aisle"; id: string }
  | { kind: "element"; id: string }
  | { kind: "seats"; ids: string[] }
  | { kind: "zone"; id: string }

type LayerNode = {
  id: string
  label: string
  selection: LayerTreeSelection
  children?: LayerNode[]
}

function namesMatch(left: string | undefined, right: string | undefined) {
  const a = left?.trim().toLowerCase()
  const b = right?.trim().toLowerCase()
  return Boolean(a && b && a === b)
}

function elementLabel(type: string, fallback: string) {
  if (fallback.trim()) return fallback.trim()
  if (type === "vip_chair") return "Asiento"
  if (type === "round_table") return "Mesa redonda"
  if (type === "long_table") return "Mesa rectangular"
  if (type === "vip_box") return "Box VIP"
  if (type === "standing_zone") return "Campo"
  return "Elemento"
}

function seatNodeLabel(input: {
  label?: string
  customLabel?: string
  number: number
  row?: string
}) {
  if (input.customLabel?.trim()) return input.customLabel.trim()
  if (input.label?.trim()) return input.label.trim()
  if (input.row?.trim()) return `Fila ${input.row} · Asiento ${input.number}`
  return `Asiento ${input.number}`
}

function selectionKey(selection: LayerTreeSelection | null): string {
  if (!selection) return ""
  if (selection.kind === "stage") return "stage"
  if (selection.kind === "seats") return `seats:${selection.ids.join(",")}`
  return `${selection.kind}:${"id" in selection ? selection.id : ""}`
}

function currentSelectionKey(
  selection: LayerTreeSelection | { kind: "elements"; ids: string[] } | null,
): string {
  if (!selection) return ""
  if (selection.kind === "elements") {
    return selection.ids.length === 1 ? `element:${selection.ids[0]}` : ""
  }
  return selectionKey(selection)
}

function nodeIsSelected(
  node: LayerNode,
  selectedKey: string,
): boolean {
  if (selectionKey(node.selection) === selectedKey) return true
  if (node.selection.kind === "seats" && selectedKey.startsWith("seats:")) {
    const selectedIds = selectedKey.slice(6).split(",")
    return node.selection.ids.some((id) => selectedIds.includes(id))
  }
  return false
}

function collectOpenIds(nodes: LayerNode[], selectedKey: string, acc: Set<string>) {
  for (const node of nodes) {
    const childHit = node.children?.some(
      (child) =>
        nodeIsSelected(child, selectedKey) ||
        Boolean(child.children?.some((nested) => nodeIsSelected(nested, selectedKey))),
    )
    if (childHit) acc.add(node.id)
    if (node.children) collectOpenIds(node.children, selectedKey, acc)
  }
}

function filterLayerTree(nodes: LayerNode[], query: string): LayerNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return nodes
  return nodes.flatMap((node) => {
    const children = node.children ? filterLayerTree(node.children, needle) : []
    if (node.label.toLowerCase().includes(needle)) {
      return [{ ...node, children: node.children }]
    }
    if (children.length > 0) {
      return [{ ...node, children }]
    }
    return []
  })
}

function collectAllOpenIds(nodes: LayerNode[], acc: Set<string>) {
  for (const node of nodes) {
    if (node.children?.length) {
      acc.add(node.id)
      collectAllOpenIds(node.children, acc)
    }
  }
}

export function buildVenueLayerTree(map: InteractiveVenueMap): LayerNode[] {
  const nodes: LayerNode[] = []
  const claimedElements = new Set<string>()
  const claimedSectors = new Set<string>()

  for (const zone of map.zones ?? []) {
    const children: LayerNode[] = []

    for (const sector of map.sectors ?? []) {
      const belongs =
        sector.id === zone.id ||
        namesMatch(sector.name, zone.name) ||
        (sector.seats ?? []).some((seat) =>
          seatBelongsToZone(
            {
              x: seat.x,
              y: seat.y,
              sectorId: sector.id,
              sectorName: sector.name,
            },
            zone,
          ),
        )
      if (!belongs) continue
      claimedSectors.add(sector.id)
      children.push({
        id: sector.id,
        label: sector.name.trim() || "Sector",
        selection: { kind: "sector", id: sector.id },
        children: (sector.seats ?? []).map((seat) => ({
          id: `${sector.id}::${seat.id}`,
          label: seatNodeLabel(seat),
          selection: { kind: "seats", ids: [`${sector.id}::${seat.id}`] },
        })),
      })
    }

    for (const element of map.elements ?? []) {
      const explicitZoneId = element.zoneId?.trim()
      if (explicitZoneId) {
        if (explicitZoneId !== zone.id) continue
      } else if (!elementBelongsToZone(element, zone)) {
        continue
      }
      claimedElements.add(element.id)
      children.push({
        id: element.id,
        label: elementLabel(element.type, element.customLabel || element.label),
        selection: { kind: "element", id: element.id },
        children:
          (element.seats ?? []).length > 0 && element.sellMode !== "group"
            ? (element.seats ?? []).map((seat) => ({
                id: `${element.id}::${seat.id}`,
                label: seatNodeLabel(seat),
                selection: { kind: "seats", ids: [`${element.id}::${seat.id}`] },
              }))
            : undefined,
      })
    }

    nodes.push({
      id: zone.id,
      label: zone.name.trim() || "Zona",
      selection: { kind: "zone", id: zone.id },
      children,
    })
  }

  for (const sector of map.sectors ?? []) {
    if (claimedSectors.has(sector.id)) continue
    nodes.push({
      id: sector.id,
      label: sector.name.trim() || "Sector",
      selection: { kind: "sector", id: sector.id },
      children: (sector.seats ?? []).map((seat) => ({
        id: `${sector.id}::${seat.id}`,
        label: seatNodeLabel(seat),
        selection: { kind: "seats", ids: [`${sector.id}::${seat.id}`] },
      })),
    })
  }

  for (const element of map.elements ?? []) {
    if (claimedElements.has(element.id)) continue
    if ((element.seats ?? []).length > 0 && element.sellMode !== "group") {
      nodes.push({
        id: element.id,
        label: elementLabel(element.type, element.customLabel || element.label),
        selection: { kind: "element", id: element.id },
        children: (element.seats ?? []).map((seat) => ({
          id: `${element.id}::${seat.id}`,
          label: seatNodeLabel(seat),
          selection: { kind: "seats", ids: [`${element.id}::${seat.id}`] },
        })),
      })
    } else {
      nodes.push({
        id: element.id,
        label: elementLabel(element.type, element.customLabel || element.label),
        selection: { kind: "element", id: element.id },
      })
    }
  }

  if (map.stage) {
    nodes.push({
      id: "stage",
      label: map.stage.label.trim() || "Escenario",
      selection: { kind: "stage" },
    })
  }

  for (const label of map.labels) {
    nodes.push({
      id: label.id,
      label: label.text.trim() || "Etiqueta",
      selection: { kind: "label", id: label.id },
    })
  }

  for (const aisle of map.aisles) {
    nodes.push({
      id: aisle.id,
      label: "Pasillo",
      selection: { kind: "aisle", id: aisle.id },
    })
  }

  return nodes
}

export function VenueLayerTree({
  map,
  selection,
  onSelect,
  collapsed = false,
  onCollapsedChange,
  activeZoneId = null,
  embedded = false,
  className,
}: {
  map: InteractiveVenueMap
  selection: LayerTreeSelection | { kind: "elements"; ids: string[] } | null
  onSelect: (next: LayerTreeSelection) => void
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  activeZoneId?: string | null
  embedded?: boolean
  className?: string
}) {
  const nodes = useMemo(() => buildVenueLayerTree(map), [map])
  const [query, setQuery] = useState("")
  const visibleNodes = useMemo(() => filterLayerTree(nodes, query), [nodes, query])
  const selectedKey = currentSelectionKey(selection)
  const [openIds, setOpenIds] = useState(() => new Set(nodes.map((node) => node.id)))
  const expandKey = `${selectedKey ?? ""}:${activeZoneId ?? ""}:${query.trim().toLowerCase()}`
  const [expandedFor, setExpandedFor] = useState(expandKey)

  if ((selectedKey || activeZoneId || query.trim()) && expandKey !== expandedFor) {
    const nextOpen = new Set(openIds)
    if (selectedKey) collectOpenIds(nodes, selectedKey, nextOpen)
    if (activeZoneId) nextOpen.add(activeZoneId)
    if (query.trim()) collectAllOpenIds(visibleNodes, nextOpen)
    setExpandedFor(expandKey)
    setOpenIds(nextOpen)
  }

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (collapsed) {
    return (
      <aside
        className={cn(
          "flex h-full w-12 shrink-0 flex-col items-center border-r border-border bg-card py-2 text-card-foreground",
          className,
        )}
      >
        <button
          type="button"
          title="Expandir estructura"
          aria-label="Expandir estructura"
          onClick={() => onCollapsedChange?.(false)}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      </aside>
    )
  }

  const Frame = embedded ? "div" : "aside"

  return (
    <Frame
      className={cn(
        "flex h-full w-full shrink-0 flex-col overflow-hidden bg-card text-card-foreground",
        !embedded && "border-r border-border",
        className,
      )}
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2">
        {embedded ? null : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-wide text-foreground uppercase">
              Estructura del Recinto
            </p>
            {onCollapsedChange ? (
              <button
                type="button"
                title="Contraer panel"
                aria-label="Contraer panel"
                onClick={() => onCollapsedChange(true)}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <PanelLeftClose className="size-4" />
              </button>
            ) : null}
          </div>
        )}
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar sector, mesa o silla..."
            aria-label="Buscar sector, mesa o silla"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
        {nodes.length === 0 ? (
          <p className="px-2 py-6 text-xs leading-relaxed text-muted-foreground">
            Todavía no hay zonas ni elementos. Usá la pestaña Construir para
            agregar mesas, butacas o el escenario.
          </p>
        ) : visibleNodes.length === 0 ? (
          <p className="px-2 py-6 text-xs leading-relaxed text-muted-foreground">
            No hay coincidencias para “{query.trim()}”.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {visibleNodes.map((node) => (
              <LayerTreeItem
                key={node.id}
                node={node}
                depth={0}
                openIds={openIds}
                selectedKey={selectedKey}
                onToggle={toggle}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </Frame>
  )
}

function LayerTreeItem({
  node,
  depth,
  openIds,
  selectedKey,
  onToggle,
  onSelect,
}: {
  node: LayerNode
  depth: number
  openIds: Set<string>
  selectedKey: string
  onToggle: (id: string) => void
  onSelect: (next: LayerTreeSelection) => void
}) {
  const hasChildren = Boolean(node.children?.length)
  const open = openIds.has(node.id)
  const selected = nodeIsSelected(node, selectedKey)

  return (
    <li>
      <div
        className="flex items-center gap-0.5"
        style={{ paddingLeft: depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? "Contraer" : "Expandir"}
            aria-expanded={open}
            onClick={() => onToggle(node.id)}
            className="grid size-6 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                !open && "-rotate-90",
              )}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.selection)}
          className={cn(
            "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            selected
              ? "bg-sky-50 font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
          )}
        >
          {hasChildren ? (
            <span className="mr-1.5 font-mono text-[11px] text-zinc-400">
              {open ? "[-]" : "[+]"}
            </span>
          ) : null}
          {node.label}
        </button>
      </div>
      {hasChildren && open ? (
        <ul className="mt-0.5">
          {node.children!.map((child) => (
            <LayerTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              openIds={openIds}
              selectedKey={selectedKey}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
