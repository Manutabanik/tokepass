"use client"

import {
  ArrowLeft,
  LayoutGrid,
  LoaderCircle,
  Ticket,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { UniversalSeatSelectionFlow } from "@/components/b2c/universal-seat-selection"
import { UniversalCheckoutBar } from "@/components/b2c/universal-seat-selection/checkout-bar"
import { UniversalGeneralQuantity } from "@/components/b2c/universal-seat-selection/general-quantity"
import {
  InteractiveSeatingCanvas,
  type InteractiveSelectedSeat,
} from "@/components/public/interactive-seating-canvas"
import {
  ParametricZonePanel,
  ParametricZonePanelFooter,
} from "@/components/public/parametric-zone-panel"
import { Button } from "@/components/ui/button"
import {
  hasMicroInventory,
  hasParametricZones,
  listMicroOccupancySectorIds,
  mergeParametricOccupancy,
  type ParametricInventoryState,
  type ParametricOccupiedItem,
} from "@/lib/seating/adaptive-seating"
import type {
  SeatStatus,
  UniversalSeatSelection,
  UniversalSector,
} from "@/lib/seating/universal-seat-types"
import { flattenVenueMapSeats } from "@/lib/seating/venue-map-geometry"
import {
  zoneIdFromClientPoint,
  zoneIdFromEventTarget,
} from "@/lib/seating/venue-polygon"
import { occupancyFromSeatingUnits } from "@/lib/seating/venue-map-occupancy"
import { useStorefrontSeatStore } from "@/lib/stores/storefront-seat-store"
import { cn } from "@/lib/utils"
import { VenueMapBackgroundLayer } from "@/components/venue/venue-map-background-layer"
import { VenueMapZoneLayer } from "@/components/venue/venue-map-zone-layer"
import type { InteractiveVenueMap, VenueMapZone } from "@/types/venue-map"
import type { EventSeatingUnit } from "@/types/venues"

const VIEW = { width: 800, height: 560 }

type AdaptiveSeatingFlowProps = {
  sectors?: UniversalSector[]
  mapImageUrl?: string | null
  venueMap?: InteractiveVenueMap | null
  eventId?: string | null
  eventTitle?: string
  pending?: boolean
  embedded?: boolean
  preview?: boolean
  takeover?: boolean
  immersive?: boolean
  readOnly?: boolean
  selectedZoneId?: string | null
  unavailableZoneIds?: string[]
  occupancyBySeatId?: Record<string, SeatStatus>
  priceBySectorId?: Record<string, number>
  onSelectZone?: (zone: VenueMapZone) => void
  onBack?: () => void
  onContinue?: (selection: UniversalSeatSelection) => void
  onLoadSectorUnits?: (sectorId: string) => Promise<EventSeatingUnit[]>
  onLoadAllUnits?: () => Promise<EventSeatingUnit[]>
  maxSelectable?: number | null
  heldSeatIds?: string[]
}

export function AdaptiveSeatingFlow({
  sectors = [],
  mapImageUrl = null,
  venueMap = null,
  eventId = null,
  eventTitle = "Selección de entradas",
  pending = false,
  embedded = false,
  preview = false,
  takeover = false,
  immersive = false,
  readOnly = false,
  selectedZoneId = null,
  unavailableZoneIds = [],
  occupancyBySeatId = {},
  priceBySectorId = {},
  onSelectZone,
  onBack,
  onContinue,
  onLoadSectorUnits,
  onLoadAllUnits,
  maxSelectable = null,
  heldSeatIds = [],
}: AdaptiveSeatingFlowProps) {
  if (immersive && venueMap) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <InteractiveSeatingCanvas
          map={venueMap}
          eventId={eventId}
          fillParent
          disableIdlePrompt
          silentHover
          hideChrome
          readOnly={readOnly}
          maxSelectable={maxSelectable ?? undefined}
          selectedZoneId={selectedZoneId}
          unavailableZoneIds={unavailableZoneIds}
          occupancyBySeatId={occupancyBySeatId}
          priceBySectorId={priceBySectorId}
          heldSeatIds={heldSeatIds}
          onSelectZone={(zone) => onSelectZone?.(zone)}
          onContinue={(seats) => {
            const seat = seats[0]
            if (seat?.row.trim()) {
              onContinue?.({
                kind: "numbered",
                sectorId: seat.sectorId,
                sectorName: seat.sectorName,
                color: seat.color,
                unitPrice: seat.price,
                groupId: `${seat.sectorId}-row-${seat.row}`,
                groupName: `Fila ${seat.row}`,
                seats: [{ id: seat.id, label: `${seat.row}-${seat.number}` }],
              })
              return
            }
            const stored = useStorefrontSeatStore.getState().selectedItems
            const last = stored[stored.length - 1]
            const sectorId = last?.sectorId ?? last?.id ?? seat?.sectorId
            if (!sectorId) return
            onContinue?.({
              kind: "general",
              sectorId,
              sectorName:
                last?.name.split(" · ")[0] ?? seat?.sectorName ?? "Zona",
              color: last?.color ?? seat?.color ?? "#34d399",
              unitPrice: last?.price ?? seat?.price ?? 0,
              quantity: Math.max(1, last?.capacity ?? seats.length ?? 1),
            })
          }}
        />
      </div>
    )
  }

  if (!hasParametricZones(venueMap) || !venueMap) {
    return (
      <UniversalSeatSelectionFlow
        sectors={sectors}
        mapImageUrl={mapImageUrl}
        venueMap={venueMap}
        eventId={eventId}
        eventTitle={eventTitle}
        pending={pending}
        embedded={embedded}
        takeover={takeover}
        onBack={onBack}
        onContinue={onContinue}
        onLoadSectorUnits={onLoadSectorUnits}
        onLoadAllUnits={onLoadAllUnits}
      />
    )
  }

  return (
    <MacroSeatingFlow
      map={venueMap}
      eventId={eventId}
      sectors={sectors}
      eventTitle={eventTitle}
      maxSelectable={maxSelectable}
      pending={pending}
      embedded={embedded}
      preview={preview}
      takeover={takeover}
      onBack={onBack}
      onContinue={onContinue}
      onLoadSectorUnits={onLoadSectorUnits}
    />
  )
}

function MacroSeatingFlow({
  map,
  eventId,
  sectors,
  eventTitle,
  pending,
  embedded,
  preview,
  takeover = false,
  onBack,
  onContinue,
  onLoadSectorUnits,
  maxSelectable = null,
}: {
  map: InteractiveVenueMap
  eventId?: string | null
  sectors: UniversalSector[]
  eventTitle: string
  pending: boolean
  embedded: boolean
  preview: boolean
  takeover?: boolean
  onBack?: () => void
  onContinue?: (selection: UniversalSeatSelection) => void
  onLoadSectorUnits?: (sectorId: string) => Promise<EventSeatingUnit[]>
  maxSelectable?: number | null
}) {
  const [zoneId, setZoneId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [selectedItem, setSelectedItem] = useState<ParametricOccupiedItem | null>(
    null,
  )
  const [occupancy, setOccupancy] = useState<
    Record<string, ParametricOccupiedItem>
  >({})
  const [inventoryState, setInventoryState] =
    useState<ParametricInventoryState>("loading")
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [mapOccupancy, setMapOccupancy] = useState<
    Record<string, "available" | "occupied" | "blocked">
  >({})
  const [mapHydrating, setMapHydrating] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({
    panX: 0,
    panY: 0,
    zoom: 1,
    startPanX: 0,
    startPanY: 0,
    startX: 0,
    startY: 0,
    startDist: 0,
    startZoom: 1,
    moved: false,
    pinching: false,
    pendingZoneId: null as string | null,
  })

  const zones = map.zones ?? []
  const zone = zones.find((item) => item.id === zoneId) ?? null
  const sector = sectors.find((item) => item.id === zoneId) ?? null
  const unitPrice = sector?.price ?? zone?.price ?? 0
  const showMicro = hasMicroInventory(map)
  const zoneLayoutType = zone?.layoutType ?? null
  const loadSectorUnitsRef = useRef(onLoadSectorUnits)
  const zoneRef = useRef(zone)

  useEffect(() => {
    loadSectorUnitsRef.current = onLoadSectorUnits
    zoneRef.current = zone
  }, [onLoadSectorUnits, zone])

  useEffect(() => {
    const load = loadSectorUnitsRef.current
    if (!showMicro || preview || !load) return
    let cancelled = false
    setMapHydrating(true)
    const ids = listMicroOccupancySectorIds(map)
    void Promise.all(ids.map((id) => load(id)))
      .then((groups) => {
        if (cancelled) return
        const units = groups.flat()
        const knownIds = flattenVenueMapSeats(map).map((seat) => seat.id)
        setMapOccupancy(occupancyFromSeatingUnits(units, knownIds))
      })
      .catch(() => {
        if (cancelled) return
        const knownIds = flattenVenueMapSeats(map).map((seat) => seat.id)
        setMapOccupancy(occupancyFromSeatingUnits([], knownIds))
      })
      .finally(() => {
        if (!cancelled) setMapHydrating(false)
      })
    return () => {
      cancelled = true
    }
  }, [map, preview, showMicro])

  useEffect(() => {
    if (!zoneId || zoneLayoutType === "general" || preview) {
      return
    }
    const load = loadSectorUnitsRef.current
    if (!load) {
      setInventoryState((current) =>
        current === "unmaterialized" ? current : "unmaterialized",
      )
      setOccupancy((current) =>
        Object.keys(current).length === 0 ? current : {},
      )
      return
    }
    let cancelled = false
    setInventoryState("loading")
    setOccupancy({})
    setSelectedItem(null)
    void load(zoneId)
      .then((units) => {
        if (cancelled) return
        const currentZone = zoneRef.current
        if (!currentZone) return
        const merged = mergeParametricOccupancy({ zone: currentZone, units })
        setOccupancy(merged.byLayoutItemId)
        setInventoryState(merged.state)
      })
      .catch(() => {
        if (!cancelled) setInventoryState("error")
      })
    return () => {
      cancelled = true
    }
  }, [preview, zoneId, zoneLayoutType])

  const resolvedInventoryState =
    !zoneId || zoneLayoutType === "general" || preview
      ? "ready"
      : inventoryState

  const selection = useMemo<UniversalSeatSelection | null>(() => {
    if (!zone) return null
    if (zone.layoutType === "general") {
      return {
        kind: "general",
        sectorId: zone.id,
        sectorName: zone.name,
        color: zone.color,
        unitPrice,
        quantity,
      }
    }
    if (
      !selectedItem ||
      selectedItem.status !== "available" ||
      !selectedItem.seatingUnitId ||
      resolvedInventoryState !== "ready"
    ) {
      return null
    }
    return {
      kind: "numbered",
      sectorId: zone.id,
      sectorName: zone.name,
      color: zone.color,
      unitPrice,
      groupId: zone.id,
      groupName: zone.name,
      seats: [
        {
          id: selectedItem.id,
          label: selectedItem.label,
          seatingUnitId: selectedItem.seatingUnitId,
        },
      ],
    }
  }, [resolvedInventoryState, quantity, selectedItem, unitPrice, zone])

  const canContinue =
    Boolean(selection) &&
    resolvedInventoryState !== "loading" &&
    resolvedInventoryState !== "unmaterialized" &&
    resolvedInventoryState !== "error"

  function handleSelectZone(next: VenueMapZone) {
    setZoneId(next.id)
    setSelectedItem(null)
    setQuantity(1)
    setOccupancy({})
    setInventoryState("loading")
  }

  function handleZoneClick(zoneId: string, event?: React.SyntheticEvent) {
    event?.stopPropagation()
    if (gesture.current.moved || pending) return
    const next = zones.find((item) => item.id === zoneId)
    if (!next) return
    handleSelectZone(next)
  }

  function handleCanvasContinue(seats: InteractiveSelectedSeat[]) {
    const seat = seats[0]
    if (!seat || pending) return
    onContinue?.({
      kind: "numbered",
      sectorId: seat.sectorId,
      sectorName: seat.sectorName,
      color: seat.color,
      unitPrice: seat.price,
      groupId: `${seat.sectorId}-row-${seat.row}`,
      groupName: `Fila ${seat.row}`,
      seats: [{ id: seat.id, label: `${seat.row}-${seat.number}` }],
    })
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current.moved = false
    gesture.current.pendingZoneId = zoneIdFromEventTarget(event.target)
    gesture.current.startX = event.clientX
    gesture.current.startY = event.clientY
    gesture.current.startPanX = gesture.current.panX
    gesture.current.startPanY = gesture.current.panY
    gesture.current.startZoom = gesture.current.zoom
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current.pinching = true
      gesture.current.startDist = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const ratio =
        gesture.current.startDist > 0 ? dist / gesture.current.startDist : 1
      const nextZoom = Math.min(3.2, Math.max(0.7, gesture.current.startZoom * ratio))
      gesture.current.zoom = nextZoom
      setZoom(nextZoom)
      gesture.current.moved = true
      return
    }
    if (gesture.current.pinching) return
    const dx = event.clientX - gesture.current.startX
    const dy = event.clientY - gesture.current.startY
    if (Math.abs(dx) + Math.abs(dy) > 8) gesture.current.moved = true
    const nextPan = {
      x: gesture.current.startPanX + dx,
      y: gesture.current.startPanY + dy,
    }
    gesture.current.panX = nextPan.x
    gesture.current.panY = nextPan.y
    setPan(nextPan)
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) gesture.current.pinching = false
    if (pointers.current.size === 0) {
      const zoneId =
        gesture.current.pendingZoneId ??
        zoneIdFromEventTarget(event.target) ??
        zoneIdFromClientPoint(event.clientX, event.clientY)
      const wasTap = !gesture.current.moved
      gesture.current.pendingZoneId = null
      if (wasTap && zoneId) handleZoneClick(zoneId, event)
    }
  }

  const panelOpen = Boolean(zone)

  return (
    <div
      className={cn(
        "relative text-zinc-100",
        takeover
          ? "flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950"
          : embedded
            ? "space-y-6"
            : "min-h-screen bg-zinc-950 pb-8",
      )}
    >
      <div
        className={cn(
          takeover
            ? "flex min-h-0 flex-1 flex-col"
            : "mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6",
        )}
      >
        <header
          className={cn(
            "flex shrink-0 items-center justify-between gap-3",
            takeover ? "px-3 py-2" : "items-start",
          )}
        >
          <div className="min-w-0">
            {takeover ? null : (
              <p className="text-[11px] font-bold tracking-[0.18em] text-zinc-500 uppercase">
                Elegí tu zona
              </p>
            )}
            <h1
              className={cn(
                "font-black tracking-tight text-white",
                takeover ? "truncate text-base" : "text-2xl",
              )}
            >
              {eventTitle}
            </h1>
            {takeover ? null : (
              <p className="text-sm text-zinc-500">
                {showMicro
                  ? "Tocá una butaca del plano o un polígono de zona."
                  : "Tocá un polígono. Después fila y mesa en la tira de abajo."}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {takeover && !showMicro ? (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Acercar el plano"
                  className="size-10 border-white/10 bg-zinc-950 text-zinc-100"
                  onClick={() => {
                    const next = Math.min(3.2, zoom + 0.25)
                    gesture.current.zoom = next
                    setZoom(next)
                  }}
                >
                  <ZoomIn className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Alejar el plano"
                  className="size-10 border-white/10 bg-zinc-950 text-zinc-100"
                  onClick={() => {
                    const next = Math.max(0.7, zoom - 0.25)
                    gesture.current.zoom = next
                    setZoom(next)
                  }}
                >
                  <ZoomOut className="size-4" />
                </Button>
              </>
            ) : null}
            {onBack ? (
              <Button
                type="button"
                variant="outline"
                size={takeover ? "icon" : "default"}
                disabled={pending}
                onClick={onBack}
                aria-label={takeover ? "Cerrar el plano" : undefined}
                className={cn(
                  "shrink-0 border-white/10 bg-zinc-950 text-zinc-300 hover:bg-zinc-800",
                  takeover ? "size-10" : "rounded-full",
                )}
              >
                {takeover ? <X className="size-4" /> : <ArrowLeft aria-hidden="true" />}
                {takeover ? null : "Volver"}
              </Button>
            ) : null}
          </div>
        </header>

        <div
          className={cn(
            "relative min-h-0",
            takeover ? "flex flex-1 flex-col" : null,
          )}
        >
          {showMicro ? (
            mapHydrating && !preview ? (
              <div
                className={cn(
                  "flex items-center justify-center border border-white/10 bg-zinc-950",
                  takeover
                    ? "h-full min-h-0 flex-1"
                    : "h-[min(62dvh,560px)] rounded-3xl",
                )}
              >
                <LoaderCircle className="size-6 animate-spin text-cyan-300" />
              </div>
            ) : (
              <InteractiveSeatingCanvas
                map={map}
                eventId={eventId}
                occupancyBySeatId={mapOccupancy}
                pending={pending}
                fillParent={takeover}
                disableIdlePrompt
                selectedZoneId={zoneId}
                maxSelectable={maxSelectable ?? undefined}
                onSelectZone={handleSelectZone}
                onContinue={handleCanvasContinue}
                onBack={takeover ? undefined : onBack}
              />
            )
          ) : (
            <svg
              viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
              className={cn(
                "w-full touch-none bg-zinc-950",
                takeover
                  ? "min-h-0 flex-1"
                  : embedded
                    ? "h-[min(52vh,420px)] rounded-3xl border border-white/10"
                    : "h-[min(62dvh,560px)] rounded-3xl border border-white/10",
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                <VenueMapBackgroundLayer map={map} />
                <VenueMapZoneLayer
                  zones={zones}
                  selectedId={zoneId}
                  selectOnPointerUp
                  onSelect={handleSelectZone}
                />
              </g>
            </svg>
          )}

          {panelOpen && zone ? (
            <div
              className={cn(
                "z-40 flex flex-col border-t border-white/10 bg-zinc-950/95 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md",
                takeover
                  ? "absolute inset-x-0 bottom-0 rounded-t-3xl pb-[max(0.6rem,env(safe-area-inset-bottom))]"
                  : "mt-3 rounded-3xl border border-white/10",
              )}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3">
                <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <LayoutGrid className="size-4 shrink-0" style={{ color: zone.color }} />
                  <span className="truncate">{zone.name}</span>
                </p>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 text-zinc-400"
                  onClick={() => {
                    setZoneId(null)
                    setSelectedItem(null)
                  }}
                  aria-label="Cerrar tira de la zona"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="flex shrink-0 flex-col px-4 pb-3 pt-2">
                {zone.layoutType === "general" ? (
                  <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Ticket className="size-4 text-cyan-300" />
                      Acceso a {zone.name}
                    </p>
                    <div className="mt-3">
                      <UniversalGeneralQuantity
                        quantity={quantity}
                        maxPerUser={
                          sector && sector.type === "general"
                            ? sector.maxPerUser
                            : 6
                        }
                        accentColor={zone.color}
                        onChange={setQuantity}
                      />
                    </div>
                  </div>
                ) : (
                  <ParametricZonePanel
                    zone={zone}
                    inventoryState={preview ? "ready" : resolvedInventoryState}
                    occupancy={occupancy}
                    selectedId={selectedItem?.id ?? null}
                    pending={pending}
                    preview={preview}
                    onSelect={(item) => {
                      if (item.status !== "available" || !item.seatingUnitId) {
                        return
                      }
                      setSelectedItem(item)
                    }}
                  />
                )}
                {!preview ? (
                  zone.layoutType === "general" ? (
                    <div className="mt-3">
                      <UniversalCheckoutBar
                        selection={selection}
                        pending={pending}
                        sticky
                        onContinue={() => {
                          if (!canContinue || pending) return
                          onContinue?.(selection!)
                        }}
                      />
                    </div>
                  ) : (
                    <ParametricZonePanelFooter
                      canContinue={canContinue}
                      pending={pending}
                      onContinue={() => {
                        if (!canContinue || pending || !selection) return
                        onContinue?.(selection)
                      }}
                    />
                  )
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
