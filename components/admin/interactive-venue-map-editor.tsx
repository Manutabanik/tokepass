"use client"

import {
  CircleDot,
  Layers,
  LayoutGrid,
  Palette,
  Save,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
  Armchair,
  Minus,
  Square,
  Eye,
  X,
  Copy,
  RotateCw,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { AutoNumberingPanel } from "@/components/admin/auto-numbering-panel"
import { ConcentricRingGenerator } from "@/components/admin/concentric-ring-generator"
import { VenueComponentPalette, type PalettePlacement } from "@/components/admin/venue-component-palette"
import { VenueMapBackgroundPanel } from "@/components/admin/venue-map-background-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VenueMapBackgroundLayer } from "@/components/venue/venue-map-background-layer"
import { VenueMapCanvas } from "@/components/venue/venue-map-canvas"
import { VenueMapElementLayer } from "@/components/venue/venue-map-element-layer"
import {
  cloneVenueElement,
  createVenueElement,
  rebuildElementSeats,
} from "@/lib/seating/venue-element-geometry"
import {
  rebuildSectorSeats,
  venueMapCapacity,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import { cn } from "@/lib/utils"
import {
  emptyVenueMap,
  parseVenueMap,
  type InteractiveVenueMap,
  type VenueMapElement,
  type VenueMapSector,
} from "@/types/venue-map"
import type { VenueSeatingLayout } from "@/types/venues"

type Tool = "select" | "stage" | "sector" | "aisle" | "label"
type Selection =
  | { kind: "stage" }
  | { kind: "sector"; id: string }
  | { kind: "label"; id: string }
  | { kind: "aisle"; id: string }
  | { kind: "element"; id: string }
  | { kind: "elements"; ids: string[] }
  | { kind: "seats"; ids: string[] }
  | null

const CANVAS = { width: 800, height: 560 }
const ZONE_COLORS = ["#f97316", "#ec4899", "#f59e0b", "#10b981", "#6366f1", "#06b6d4"]

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function seatKey(sectorId: string, seatId: string) {
  return `${sectorId}::${seatId}`
}

export function InteractiveVenueMapEditor({
  value,
  onChange,
  onSave,
  saving = false,
}: {
  value?: InteractiveVenueMap | null
  onChange: (map: InteractiveVenueMap, seatingLayout: VenueSeatingLayout) => void
  onSave?: (map: InteractiveVenueMap) => void
  saving?: boolean
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [map, setMap] = useState<InteractiveVenueMap>(
    parseVenueMap(value ?? emptyVenueMap()),
  )
  const [tool, setTool] = useState<Tool>("select")
  const [placement, setPlacement] = useState<PalettePlacement | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [zoom, setZoom] = useState(1)
  const [preview, setPreview] = useState(false)
  const [showRings, setShowRings] = useState(false)
  const [marquee, setMarquee] = useState<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)
  const drag = useRef<{
    x: number
    y: number
    ids?: string[]
  } | null>(null)
  const mapRef = useRef(map)
  mapRef.current = map
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const elementDrag = useRef<{
    kind: "stage" | "label" | "aisle" | "sector" | "element" | "pan"
    id?: string
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  useEffect(() => {
    if (!value) return
    setMap(parseVenueMap(value))
  }, [value])

  const selectedSector =
    selection?.kind === "sector"
      ? map.sectors.find((sector) => sector.id === selection.id) ?? null
      : null
  const selectedElement =
    selection?.kind === "element"
      ? (map.elements ?? []).find((item) => item.id === selection.id) ?? null
      : null
  const selectedElementIds =
    selection?.kind === "elements"
      ? selection.ids
      : selection?.kind === "element"
        ? [selection.id]
        : []

  function commit(next: InteractiveVenueMap) {
    mapRef.current = next
    setMap(next)
    onChange(next, venueMapToSeatingLayout(next))
  }

  function pointerToSvg(event: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const mapped = point.matrixTransform(ctm.inverse())
    return {
      x: (mapped.x - pan.x) / zoom,
      y: (mapped.y - pan.y) / zoom,
    }
  }

  function addSector() {
    const color = ZONE_COLORS[map.sectors.length % ZONE_COLORS.length]!
    const draft: VenueMapSector = {
      id: newId("sec"),
      name: `Sector ${map.sectors.length + 1}`,
      color,
      price: 0,
      x: 220,
      y: 160 + map.sectors.length * 28,
      rows: 6,
      seatsPerRow: 12,
      curvature: 0.45,
      aisle: true,
      seats: [],
    }
    draft.seats = rebuildSectorSeats(draft)
    commit({ ...map, sectors: [...map.sectors, draft] })
    setSelection({ kind: "sector", id: draft.id })
    setTool("select")
  }

  function addStage() {
    commit({
      ...map,
      stage: {
        label: "ESCENARIO",
        x: 200,
        y: 20,
        width: 400,
        height: 50,
      },
    })
    setSelection({ kind: "stage" })
    setTool("select")
  }

  function addLabel() {
    const presets = ["PLATEA BAJA", "PULLMAN", "GRADAS", "PALCOS"]
    const text = presets[map.labels.length % presets.length]!
    const id = newId("lbl")
    commit({
      ...map,
      labels: [
        ...map.labels,
        { id, text, x: 320, y: 100 + map.labels.length * 24, color: "#ec4899" },
      ],
    })
    setSelection({ kind: "label", id })
    setTool("select")
  }

  function addAisle() {
    const id = newId("aisle")
    commit({
      ...map,
      aisles: [
        ...map.aisles,
        { id, x: 390, y: 120, width: 20, height: 280 },
      ],
    })
    setSelection({ kind: "aisle", id })
    setTool("select")
  }

  function patchSector(id: string, patch: Partial<VenueMapSector>) {
    const current = mapRef.current
    commit({
      ...current,
      sectors: current.sectors.map((sector) => {
        if (sector.id !== id) return sector
        const next = { ...sector, ...patch }
        if (
          patch.rows != null ||
          patch.seatsPerRow != null ||
          patch.curvature != null ||
          patch.aisle != null ||
          patch.x != null ||
          patch.y != null
        ) {
          next.seats = rebuildSectorSeats(next)
        }
        return next
      }),
    })
  }

  function ensureElements(current: InteractiveVenueMap): VenueMapElement[] {
    return current.elements ?? []
  }

  function placeAt(point: { x: number; y: number }, nextPlacement = placement) {
    if (!nextPlacement) return
    const current = mapRef.current
    if (nextPlacement.kind === "seat_block") {
      addSector()
      setPlacement(null)
      return
    }
    const count = ensureElements(current).filter(
      (item) =>
        item.type === nextPlacement.type &&
        item.subtype === nextPlacement.subtype,
    ).length
    const created = createVenueElement(
      nextPlacement.type,
      count,
      point,
      nextPlacement.subtype,
    )
    commit({ ...current, elements: [...ensureElements(current), created] })
    setSelection({ kind: "element", id: created.id })
    setPlacement(null)
    setTool("select")
  }

  function patchElement(id: string, patch: Partial<VenueMapElement>) {
    const current = mapRef.current
    commit({
      ...current,
      elements: ensureElements(current).map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        if (
          patch.x != null ||
          patch.y != null ||
          patch.rotation != null ||
          patch.chairCount != null ||
          patch.sideA != null ||
          patch.sideB != null ||
          patch.width != null ||
          patch.height != null
        ) {
          next.seats = rebuildElementSeats(next)
        }
        return next
      }),
    })
  }

  function duplicateSelection() {
    const current = mapRef.current
    const ids =
      selection?.kind === "element"
        ? [selection.id]
        : selection?.kind === "elements"
          ? selection.ids
          : []
    if (ids.length === 0) return
    const clones = ensureElements(current)
      .filter((item) => ids.includes(item.id))
      .map((item) => cloneVenueElement(item))
    commit({ ...current, elements: [...ensureElements(current), ...clones] })
    setSelection(
      clones.length === 1
        ? { kind: "element", id: clones[0]!.id }
        : { kind: "elements", ids: clones.map((item) => item.id) },
    )
  }

  function applyGeneratedRing(elements: VenueMapElement[], replaceGroupId: string) {
    const current = mapRef.current
    const kept = ensureElements(current).filter(
      (item) => item.groupId !== replaceGroupId,
    )
    const next = { ...current, elements: [...kept, ...elements] }
    commit(next)
    setSelection({ kind: "elements", ids: elements.map((item) => item.id) })
    setTool("select")
    setShowRings(false)
  }

  function selectGrade(groupId: string) {
    const ids = ensureElements(mapRef.current)
      .filter((item) => item.groupId === groupId)
      .map((item) => item.id)
    if (ids.length === 1) setSelection({ kind: "element", id: ids[0]! })
    else if (ids.length > 1) setSelection({ kind: "elements", ids })
  }

  function batchPrice(price: number) {
    const ids = new Set(selectedElementIds)
    if (ids.size === 0) return
    const current = mapRef.current
    commit({
      ...current,
      elements: ensureElements(current).map((item) =>
        ids.has(item.id) ? { ...item, price } : item,
      ),
    })
  }

  function deleteSelection() {
    if (!selection) return
    if (selection.kind === "stage") {
      commit({ ...map, stage: null })
    } else if (selection.kind === "sector") {
      commit({
        ...map,
        sectors: map.sectors.filter((sector) => sector.id !== selection.id),
      })
    } else if (selection.kind === "label") {
      commit({
        ...map,
        labels: map.labels.filter((label) => label.id !== selection.id),
      })
    } else if (selection.kind === "aisle") {
      commit({
        ...map,
        aisles: map.aisles.filter((aisle) => aisle.id !== selection.id),
      })
    } else if (selection.kind === "element") {
      commit({
        ...map,
        elements: ensureElements(map).filter((item) => item.id !== selection.id),
      })
    } else if (selection.kind === "elements") {
      const ids = new Set(selection.ids)
      commit({
        ...map,
        elements: ensureElements(map).filter((item) => !ids.has(item.id)),
      })
    } else if (selection.kind === "seats") {
      const blocked = new Set(selection.ids)
      commit({
        ...map,
        sectors: map.sectors.map((sector) => ({
          ...sector,
          seats: sector.seats.map((seat) =>
            blocked.has(seatKey(sector.id, seat.id))
              ? { ...seat, status: "blocked" as const }
              : seat,
          ),
        })),
      })
    }
    setSelection(null)
  }

  function restoreSelectedSeats() {
    if (selection?.kind !== "seats") return
    const ids = new Set(selection.ids)
    commit({
      ...map,
      sectors: map.sectors.map((sector) => ({
        ...sector,
        seats: sector.seats.map((seat) =>
          ids.has(seatKey(sector.id, seat.id))
            ? { ...seat, status: "available" as const }
            : seat,
        ),
      })),
    })
  }

  function beginElementDrag(
    kind: "stage" | "label" | "aisle" | "sector" | "element",
    event: React.PointerEvent,
    origX: number,
    origY: number,
    id?: string,
  ) {
    const point = pointerToSvg(event)
    elementDrag.current = {
      kind,
      id,
      startX: point.x,
      startY: point.y,
      origX,
      origY,
    }
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (preview) return
    const point = pointerToSvg(event)
    if (placement && !event.altKey) {
      placeAt(point)
      return
    }
    if (event.altKey && !placement) {
      elementDrag.current = {
        kind: "pan",
        startX: event.clientX,
        startY: event.clientY,
        origX: pan.x,
        origY: pan.y,
      }
      return
    }
    if (tool !== "select") return
    drag.current = { x: point.x, y: point.y }
    setMarquee({ x: point.x, y: point.y, w: 0, h: 0 })
    setSelection(null)
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (preview) return
    const moving = elementDrag.current
    if (moving?.kind === "pan") {
      setPan({
        x: moving.origX + (event.clientX - moving.startX),
        y: moving.origY + (event.clientY - moving.startY),
      })
      return
    }
    const current = mapRef.current
    if (moving) {
      const point = pointerToSvg(event)
      const dx = point.x - moving.startX
      const dy = point.y - moving.startY
      const nx = Math.round(moving.origX + dx)
      const ny = Math.round(moving.origY + dy)
      if (moving.kind === "stage" && current.stage) {
        commit({ ...current, stage: { ...current.stage, x: nx, y: ny } })
      } else if (moving.kind === "label" && moving.id) {
        commit({
          ...current,
          labels: current.labels.map((label) =>
            label.id === moving.id ? { ...label, x: nx, y: ny } : label,
          ),
        })
      } else if (moving.kind === "aisle" && moving.id) {
        commit({
          ...current,
          aisles: current.aisles.map((aisle) =>
            aisle.id === moving.id ? { ...aisle, x: nx, y: ny } : aisle,
          ),
        })
      } else if (moving.kind === "sector" && moving.id) {
        patchSector(moving.id, { x: nx, y: ny })
      } else if (moving.kind === "element" && moving.id) {
        patchElement(moving.id, { x: nx, y: ny })
      }
      return
    }
    if (!drag.current) return
    const point = pointerToSvg(event)
    if (marquee) {
      setMarquee({
        x: Math.min(drag.current.x, point.x),
        y: Math.min(drag.current.y, point.y),
        w: Math.abs(point.x - drag.current.x),
        h: Math.abs(point.y - drag.current.y),
      })
    }
  }

  function onPointerUp() {
    if (marquee && marquee.w > 8 && marquee.h > 8) {
      const ids: string[] = []
      for (const sector of mapRef.current.sectors) {
        for (const seat of sector.seats) {
          if (
            seat.x >= marquee.x &&
            seat.x <= marquee.x + marquee.w &&
            seat.y >= marquee.y &&
            seat.y <= marquee.y + marquee.h
          ) {
            ids.push(seatKey(sector.id, seat.id))
          }
        }
      }
      if (ids.length > 0) {
        setSelection({ kind: "seats", ids })
      } else {
        const elementIds = ensureElements(mapRef.current)
          .filter(
            (item) =>
              item.x >= marquee.x &&
              item.x <= marquee.x + marquee.w &&
              item.y >= marquee.y &&
              item.y <= marquee.y + marquee.h,
          )
          .map((item) => item.id)
        if (elementIds.length === 1) {
          setSelection({ kind: "element", id: elementIds[0]! })
        } else if (elementIds.length > 1) {
          setSelection({ kind: "elements", ids: elementIds })
        }
      }
    }
    drag.current = null
    elementDrag.current = null
    setMarquee(null)
  }

  const selectedSeatCount = selection?.kind === "seats" ? selection.ids.length : 0
  const capacity = useMemo(() => venueMapCapacity(map), [map])

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-zinc-900">
        <ToolButton active={tool === "select"} onClick={() => setTool("select")} label="Seleccionar">
          <LayoutGrid className="size-4" />
        </ToolButton>
        <ToolButton active={false} onClick={addStage} label="Escenario">
          <Square className="size-4" />
        </ToolButton>
        <ToolButton active={false} onClick={addSector} label="Bloque de asientos">
          <Armchair className="size-4" />
        </ToolButton>
        <ToolButton
          active={showRings}
          onClick={() => setShowRings((value) => !value)}
          label="Gradería anular"
        >
          <Layers className="size-4" />
        </ToolButton>
        <ToolButton active={false} onClick={addAisle} label="Pasillo">
          <Minus className="size-4" />
        </ToolButton>
        <ToolButton active={false} onClick={addLabel} label="Etiqueta de nivel">
          <Type className="size-4" />
        </ToolButton>
        <ToolButton
          active={false}
          onClick={duplicateSelection}
          label="Duplicar"
        >
          <Copy className="size-4" />
        </ToolButton>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="icon" variant="outline" onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))} aria-label="Alejar">
            <ZoomOut className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} aria-label="Acercar">
            <ZoomIn className="size-4" />
          </Button>
          <Button type="button" variant="outline" onClick={() => setPreview(true)}>
            <Eye className="size-4" />
            Vista previa del comprador
          </Button>
          {onSave ? (
            <Button type="button" disabled={saving} onClick={() => onSave(map)} className="bg-emerald-500 text-black hover:bg-emerald-400">
              <Save className="size-4" />
              Guardar plano
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr_280px]">
        <VenueComponentPalette
          active={placement}
          onPick={(next) => {
            setPlacement(next)
            setTool("select")
          }}
        />
        <div
          className="relative min-h-[420px] overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] bg-[size:20px_20px] dark:bg-zinc-950"
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = "copy"
          }}
          onDrop={(event) => {
            event.preventDefault()
            try {
              const raw = event.dataTransfer.getData("application/x-tokepass-venue")
              if (!raw) return
              const next = JSON.parse(raw) as PalettePlacement
              const svg = svgRef.current
              if (!svg) return
              const point = svg.createSVGPoint()
              point.x = event.clientX
              point.y = event.clientY
              const ctm = svg.getScreenCTM()
              if (!ctm) return
              const mapped = point.matrixTransform(ctm.inverse())
              placeAt(
                { x: (mapped.x - pan.x) / zoom, y: (mapped.y - pan.y) / zoom },
                next,
              )
            } catch {
              /* ignore */
            }
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
            className="h-[min(70vh,560px)] w-full touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              <rect width={CANVAS.width} height={CANVAS.height} fill="transparent" />
              <VenueMapBackgroundLayer map={map} />
              {map.aisles.map((aisle) => (
                <rect
                  key={aisle.id}
                  x={aisle.x}
                  y={aisle.y}
                  width={aisle.width}
                  height={aisle.height}
                  rx={6}
                  className={cn(
                    "fill-zinc-800/80 stroke-zinc-600",
                    selection?.kind === "aisle" && selection.id === aisle.id && "stroke-emerald-400",
                  )}
                  strokeWidth={1.5}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    setSelection({ kind: "aisle", id: aisle.id })
                    beginElementDrag("aisle", event, aisle.x, aisle.y, aisle.id)
                  }}
                />
              ))}
              {map.stage ? (
                <g
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    setSelection({ kind: "stage" })
                    if (map.stage) {
                      beginElementDrag("stage", event, map.stage.x, map.stage.y)
                    }
                  }}
                >
                  <rect
                    x={map.stage.x}
                    y={map.stage.y}
                    width={map.stage.width}
                    height={map.stage.height}
                    rx={10}
                    className="fill-zinc-200 dark:fill-zinc-100"
                  />
                  <text
                    x={map.stage.x + map.stage.width / 2}
                    y={map.stage.y + map.stage.height / 2 + 5}
                    textAnchor="middle"
                    className="fill-zinc-900 text-[13px] font-black tracking-[0.28em]"
                  >
                    {map.stage.label}
                  </text>
                </g>
              ) : null}
              {map.sectors.map((sector) => (
                <g key={sector.id}>
                  {sector.seats.map((seat) => {
                    const key = seatKey(sector.id, seat.id)
                    const active =
                      (selection?.kind === "sector" && selection.id === sector.id) ||
                      (selection?.kind === "seats" && selection.ids.includes(key))
                    return (
                      <circle
                        key={seat.id}
                        cx={seat.x}
                        cy={seat.y}
                        r={6}
                        fill={seat.status === "blocked" ? "#3f3f46" : sector.color}
                        opacity={seat.status === "blocked" ? 0.35 : 1}
                        stroke={active ? "#fff" : "rgba(0,0,0,0.35)"}
                        strokeWidth={active ? 2 : 0.6}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          if (event.shiftKey) {
                            setSelection({ kind: "seats", ids: [key] })
                            return
                          }
                          setSelection({ kind: "sector", id: sector.id })
                          beginElementDrag(
                            "sector",
                            event,
                            sector.x,
                            sector.y,
                            sector.id,
                          )
                        }}
                      />
                    )
                  })}
                </g>
              ))}
              <VenueMapElementLayer
                elements={map.elements ?? []}
                selectedIds={selectedElementIds}
                showSeats={(map.elements?.length ?? 0) < 220}
                zoom={zoom}
                onElementPointerDown={(event, element) => {
                  event.stopPropagation()
                  let target = element
                  if (event.altKey) {
                    const clone = cloneVenueElement(element)
                    const current = mapRef.current
                    commit({
                      ...current,
                      elements: [...ensureElements(current), clone],
                    })
                    target = clone
                  }
                  setSelection({ kind: "element", id: target.id })
                  beginElementDrag("element", event, target.x, target.y, target.id)
                }}
              />
              {map.labels.map((label) => (
                <text
                  key={label.id}
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fill={label.color}
                  className="cursor-pointer text-[15px] font-black tracking-[0.22em]"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    setSelection({ kind: "label", id: label.id })
                    beginElementDrag("label", event, label.x, label.y, label.id)
                  }}
                >
                  {label.text}
                </text>
              ))}
              {marquee ? (
                <rect
                  x={marquee.x}
                  y={marquee.y}
                  width={marquee.w}
                  height={marquee.h}
                  className="fill-emerald-400/10 stroke-emerald-400"
                  strokeDasharray="4 3"
                />
              ) : null}
            </g>
          </svg>
        </div>

        <aside className="space-y-4 border-t border-zinc-200 p-4 dark:border-white/10 lg:border-t-0 lg:border-l">
          {showRings ? (
            <ConcentricRingGenerator onGenerate={applyGeneratedRing} />
          ) : null}
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-500 uppercase">
              Propiedades
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {capacity} butacas activas
            </p>
          </div>

          {selectedSector ? (
            <div className="space-y-3">
              <Field label="Zona">
                <Input
                  value={selectedSector.name}
                  onChange={(event) =>
                    patchSector(selectedSector.id, { name: event.target.value })
                  }
                />
              </Field>
              <Field label="Precio (ARS)">
                <Input
                  type="number"
                  min={0}
                  value={selectedSector.price}
                  onChange={(event) =>
                    patchSector(selectedSector.id, {
                      price: Number(event.target.value) || 0,
                    })
                  }
                />
              </Field>
              <Field label="Color">
                <div className="flex items-center gap-2">
                  <Palette className="size-4 text-zinc-500" />
                  <input
                    type="color"
                    value={selectedSector.color}
                    onChange={(event) =>
                      patchSector(selectedSector.id, { color: event.target.value })
                    }
                    className="h-8 w-full cursor-pointer rounded border border-zinc-700 bg-transparent"
                  />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Filas">
                  <Input
                    type="number"
                    min={1}
                    max={40}
                    value={selectedSector.rows}
                    onChange={(event) =>
                      patchSector(selectedSector.id, {
                        rows: Number(event.target.value) || 1,
                      })
                    }
                  />
                </Field>
                <Field label="Asientos / fila">
                  <Input
                    type="number"
                    min={1}
                    max={40}
                    value={selectedSector.seatsPerRow}
                    onChange={(event) =>
                      patchSector(selectedSector.id, {
                        seatsPerRow: Number(event.target.value) || 1,
                      })
                    }
                  />
                </Field>
              </div>
              <Field label={`Curvatura (${Math.round(selectedSector.curvature * 100)}%)`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedSector.curvature}
                  onChange={(event) =>
                    patchSector(selectedSector.id, {
                      curvature: Number(event.target.value),
                    })
                  }
                  className="w-full accent-emerald-500"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={selectedSector.aisle}
                  onChange={(event) =>
                    patchSector(selectedSector.id, { aisle: event.target.checked })
                  }
                />
                Pasillo central
              </label>
            </div>
          ) : selectedElement ? (
            <div className="space-y-3">
              <Field label="Nombre">
                <Input
                  value={selectedElement.label}
                  onChange={(event) =>
                    patchElement(selectedElement.id, { label: event.target.value })
                  }
                />
              </Field>
              <Field label="Categoría">
                <Input
                  value={selectedElement.category}
                  onChange={(event) =>
                    patchElement(selectedElement.id, {
                      category: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Precio (ARS)">
                <Input
                  type="number"
                  min={0}
                  value={selectedElement.price}
                  onChange={(event) =>
                    patchElement(selectedElement.id, {
                      price: Number(event.target.value) || 0,
                    })
                  }
                />
              </Field>
              <Field label="Color">
                <div className="flex items-center gap-2">
                  <Palette className="size-4 text-zinc-500" />
                  <input
                    type="color"
                    value={selectedElement.color}
                    onChange={(event) =>
                      patchElement(selectedElement.id, {
                        color: event.target.value,
                      })
                    }
                    className="h-8 w-full cursor-pointer rounded border border-zinc-700 bg-transparent"
                  />
                </div>
              </Field>
              <Field label={`Rotación (${Math.round(selectedElement.rotation)}°)`}>
                <div className="flex items-center gap-2">
                  <RotateCw className="size-4 text-zinc-500" />
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={selectedElement.rotation}
                    onChange={(event) =>
                      patchElement(selectedElement.id, {
                        rotation: Number(event.target.value),
                      })
                    }
                    className="w-full accent-emerald-500"
                  />
                </div>
              </Field>
              {selectedElement.type === "round_table" ||
              selectedElement.type === "vip_box" ? (
                <Field label="Sillas">
                  <Input
                    type="number"
                    min={2}
                    max={12}
                    value={selectedElement.chairCount}
                    onChange={(event) =>
                      patchElement(selectedElement.id, {
                        chairCount: Number(event.target.value) || 2,
                      })
                    }
                  />
                </Field>
              ) : null}
              {selectedElement.type === "long_table" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Lado A">
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={selectedElement.sideA}
                      onChange={(event) =>
                        patchElement(selectedElement.id, {
                          sideA: Number(event.target.value) || 1,
                        })
                      }
                    />
                  </Field>
                  <Field label="Lado B">
                    <Input
                      type="number"
                      min={0}
                      max={12}
                      value={selectedElement.sideB}
                      onChange={(event) =>
                        patchElement(selectedElement.id, {
                          sideB: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </Field>
                </div>
              ) : null}
              {selectedElement.type === "standing_zone" ? (
                <Field label="Cupo máximo">
                  <Input
                    type="number"
                    min={1}
                    value={selectedElement.capacity}
                    onChange={(event) =>
                      patchElement(selectedElement.id, {
                        capacity: Number(event.target.value) || 1,
                      })
                    }
                  />
                </Field>
              ) : null}
              {selectedElement.type === "round_table" ||
              selectedElement.type === "long_table" ||
              selectedElement.type === "vip_box" ? (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={selectedElement.sellMode === "group"}
                    onChange={(event) =>
                      patchElement(selectedElement.id, {
                        sellMode: event.target.checked ? "group" : "per_seat",
                      })
                    }
                  />
                  Vender el grupo completo
                </label>
              ) : null}
              <AutoNumberingPanel
                elements={ensureElements(map)}
                selectedIds={[selectedElement.id]}
                onApply={(next) => commit({ ...map, elements: next })}
              />
              {selectedElement.groupId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => selectGrade(selectedElement.groupId!)}
                >
                  <CircleDot className="size-4" />
                  Seleccionar grada completa
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={duplicateSelection}>
                <Copy className="size-4" />
                Duplicar
              </Button>
            </div>
          ) : selection?.kind === "elements" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {selection.ids.length} componentes seleccionados. El precio se
                aplica a todos.
              </p>
              <Field label="Precio en lote (ARS)">
                <Input
                  type="number"
                  min={0}
                  onChange={(event) =>
                    batchPrice(Number(event.target.value) || 0)
                  }
                />
              </Field>
              <AutoNumberingPanel
                elements={ensureElements(map)}
                selectedIds={selection.ids}
                onApply={(next) => commit({ ...map, elements: next })}
              />
              <Button type="button" variant="outline" onClick={duplicateSelection}>
                <Copy className="size-4" />
                Duplicar selección
              </Button>
            </div>
          ) : selection?.kind === "stage" && map.stage ? (
            <Field label="Etiqueta del escenario">
              <Input
                value={map.stage.label}
                onChange={(event) =>
                  commit({
                    ...map,
                    stage: { ...map.stage!, label: event.target.value.toUpperCase() },
                  })
                }
              />
            </Field>
          ) : selection?.kind === "label" ? (
            <Field label="Texto de nivel">
              <Input
                value={map.labels.find((item) => item.id === selection.id)?.text ?? ""}
                onChange={(event) =>
                  commit({
                    ...map,
                    labels: map.labels.map((item) =>
                      item.id === selection.id
                        ? { ...item, text: event.target.value.toUpperCase() }
                        : item,
                    ),
                  })
                }
              />
            </Field>
          ) : selection?.kind === "seats" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {selectedSeatCount} asientos seleccionados. Podés desactivarlos o reactivarlos en lote.
              </p>
              <Button type="button" variant="outline" onClick={restoreSelectedSeats}>
                Reactivar seleccionadas
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Elegí un componente a la izquierda y hacé clic o arrastralo al plano.
              Alt + arrastre duplica mesas. Alt sobre el fondo desplaza el lienzo.
            </p>
          )}

          {selection ? (
            <Button type="button" variant="destructive" onClick={deleteSelection}>
              <Trash2 className="size-4" />
              {selection.kind === "seats" ? "Desactivar seleccionadas" : "Eliminar"}
            </Button>
          ) : null}

          <VenueMapBackgroundPanel
            map={map}
            onChange={(patch) => commit({ ...mapRef.current, ...patch })}
          />
        </aside>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="text-sm font-semibold text-white">Vista previa del comprador</p>
              <Button type="button" size="icon" variant="ghost" onClick={() => setPreview(false)} aria-label="Cerrar">
                <X className="size-4" />
              </Button>
            </div>
            <VenueMapCanvas map={map} className="h-[min(70vh,520px)] w-full" />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      onClick={onClick}
      className={cn("h-9 gap-1.5", active && "ring-1 ring-emerald-500/40")}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-zinc-400">{label}</Label>
      {children}
    </div>
  )
}
