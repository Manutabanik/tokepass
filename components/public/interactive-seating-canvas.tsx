"use client"

import {
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

import { useSeatingOccupancyRealtime } from "@/hooks/use-seating-occupancy-realtime"
import { storefrontLimitMessage } from "@/lib/checkout-limits"
import { formatCurrency } from "@/lib/format"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { flattenVenueMapSeats, type FlattenedVenueSeat } from "@/lib/seating/venue-map-geometry"
import {
  hexToRgba,
  resolveLiveVenueSeatStatus,
} from "@/lib/seating/venue-map-occupancy"
import {
  hydrateStorefrontItemsFromMap,
  resolveVenueUnitPrice,
  storefrontFocusCard,
  storefrontItemFromElement,
  storefrontItemFromZone,
} from "@/lib/seating/storefront-selection"
import { StorefrontSelectionCard } from "@/components/public/storefront-selection-card"
import { VenueMapBackgroundLayer } from "@/components/venue/venue-map-background-layer"
import { VenueMapElementLayer } from "@/components/venue/venue-map-element-layer"
import { VenueMapZoneLayer } from "@/components/venue/venue-map-zone-layer"
import { TheatreSeatSymbol } from "@/components/admin/venue-svg-symbols"
import {
  useStorefrontSeatStore,
  type StorefrontSelectedItem,
} from "@/lib/stores/storefront-seat-store"
import { cn } from "@/lib/utils"
import { elementAabb, unionAabb, type Aabb } from "@/lib/seating/venue-transform"
import {
  CONTEXT_FOCUS_ANIM_MS,
  CONTEXT_FOCUS_MAX_SCALE,
  CONTEXT_FOCUS_MIN_SCALE,
  CONTEXT_FOCUS_PADDING,
  elementBelongsToZone,
  expandSelectionForContext,
  lodCameraTransform,
  resolveLodZones,
  seatBelongsToZone,
  shouldEnableMapLod,
  zoneCanvasAabb,
  type MapLodMode,
} from "@/lib/seating/venue-map-lod"
import { isInfrastructureElement, isSellableElement } from "@/types/venue-map"
import type {
  InteractiveVenueMap,
  VenueMapElement,
  VenueMapZone,
} from "@/types/venue-map"

const VIEW = { width: 800, height: 560 }
const MIN_ZOOM = 0.8
const MAX_ZOOM = 3.5
const WHEEL_STEP = 0.05
const ZOOM_ANIM_MS = 160
const HOLD_MINUTES = 10
const INACTIVITY_MS = 5 * 60 * 1000
const MIN_HIT_PX = 44
const VIEW_TOP_PAD = 40

export type InteractiveSelectedSeat = {
  id: string
  row: string
  number: number
  sectorId: string
  sectorName: string
  price: number
  color: string
}

function stampActivity(ref: { current: number }) {
  ref.current = Date.now()
}

function vibrateTap() {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(50)
    }
  } catch {
    /* algunos navegadores bloquean vibrate fuera de un gesto */
  }
}

export function InteractiveSeatingCanvas({
  map,
  eventId = null,
  occupancyBySeatId = {},
  priceBySectorId = {},
  pending = false,
  onContinue,
  onBack,
  fillParent = false,
  disableIdlePrompt = false,
  selectedZoneId = null,
  onSelectZone,
  unavailableZoneIds = [],
  silentHover: _silentHover = false,
  hideChrome = false,
  readOnly = false,
  maxSelectable,
  heldSeatIds = [],
  onPickSeat,
  onPickElement,
  posStatusColors = false,
}: {
  map: InteractiveVenueMap
  eventId?: string | null
  occupancyBySeatId?: Record<string, SeatStatus>
  priceBySectorId?: Record<string, number>
  pending?: boolean
  onContinue: (seats: InteractiveSelectedSeat[]) => void
  onBack?: () => void
  fillParent?: boolean
  disableIdlePrompt?: boolean
  selectedZoneId?: string | null
  onSelectZone?: (zone: VenueMapZone) => void
  unavailableZoneIds?: string[]
  silentHover?: boolean
  hideChrome?: boolean
  readOnly?: boolean
  maxSelectable?: number
  heldSeatIds?: string[]
  onPickSeat?: (seat: InteractiveSelectedSeat) => void
  onPickElement?: (element: VenueMapElement) => void
  posStatusColors?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef<ReactZoomPanPinchContentRef>(null)
  const lastActivity = useRef(0)

  const [zoom, setZoom] = useState(1)
  const [wrapWidth, setWrapWidth] = useState(360)
  const [wrapHeight, setWrapHeight] = useState(280)
  const [idleOpen, setIdleOpen] = useState(false)
  const [viewMode, setViewMode] = useState<MapLodMode>("macro")
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null)
  const selectedItems = useStorefrontSeatStore((state) => state.selectedItems)
  const selectedSeats = useStorefrontSeatStore((state) => state.layoutSeats)
  const focusedMapIds = useStorefrontSeatStore((state) => state.focusedMapIds)
  const focusTick = useStorefrontSeatStore((state) => state.focusTick)
  const toggleSelectedItem = useStorefrontSeatStore(
    (state) => state.toggleSelectedItem,
  )
  const toggleLayoutSeat = useStorefrontSeatStore((state) => state.toggleLayoutSeat)
  const removeSelectedItem = useStorefrontSeatStore(
    (state) => state.removeSelectedItem,
  )
  const plotSeats = useMemo(() => {
    const zoneIds = new Set((map.zones ?? []).map((zone) => zone.id))
    return flattenVenueMapSeats(map).filter(
      (seat) => seat.source === "sector" && !zoneIds.has(seat.sectorId),
    )
  }, [map])
  const liveSelectedItems = useMemo(
    () => hydrateStorefrontItemsFromMap(selectedItems, map, priceBySectorId),
    [map, priceBySectorId, selectedItems],
  )
  const [liveOccupancy, setLiveOccupancy] = useState<Record<string, SeatStatus>>(
    {},
  )
  const applyOccupancyPatch = useCallback((patch: Record<string, SeatStatus>) => {
    setLiveOccupancy((current) => ({ ...current, ...patch }))
  }, [])
  useSeatingOccupancyRealtime(eventId, applyOccupancyPatch, "canvas")
  useEffect(() => {
    setLiveOccupancy({})
  }, [eventId])
  const occupancy = useMemo(
    () => ({ ...occupancyBySeatId, ...liveOccupancy }),
    [liveOccupancy, occupancyBySeatId],
  )
  const heldSet = useMemo(() => new Set(heldSeatIds), [heldSeatIds])
  const selectedIds = useMemo(
    () => new Set(selectedSeats.map((seat) => seat.id)),
    [selectedSeats],
  )
  const selectedElementIds = useMemo(
    () =>
      liveSelectedItems
        .filter((item) => item.type === "table" || item.type === "standing")
        .map((item) => item.id),
    [liveSelectedItems],
  )
  const selectedZoneIds = useMemo(
    () =>
      liveSelectedItems
        .filter((item) => item.type === "zone")
        .map((item) => item.id),
    [liveSelectedItems],
  )
  const lodEnabled = shouldEnableMapLod(map)
  const lodZones = useMemo(() => resolveLodZones(map), [map])
  const focusedZone = useMemo(
    () => lodZones.find((zone) => zone.id === focusedZoneId) ?? null,
    [focusedZoneId, lodZones],
  )
  const lodActive = lodEnabled && viewMode === "macro"
  const microActive = !lodEnabled || viewMode === "micro"
  const visibleElementIds = useMemo(() => {
    if (!microActive) return new Set<string>()
    const sellable = (map.elements ?? []).filter(isSellableElement)
    if (!focusedZone) return new Set(sellable.map((element) => element.id))
    const matched = sellable.filter((element) =>
      elementBelongsToZone(element, focusedZone),
    )
    const source = matched.length > 0 ? matched : sellable
    return new Set(source.map((element) => element.id))
  }, [focusedZone, map.elements, microActive])
  const focusedHasMicro = useMemo(() => {
    if (!focusedZone) return false
    const hasElement = (map.elements ?? [])
      .filter(isSellableElement)
      .some((element) => elementBelongsToZone(element, focusedZone))
    if (hasElement) return true
    return plotSeats.some((seat) => seatBelongsToZone(seat, focusedZone))
  }, [focusedZone, map.elements, plotSeats])
  const spotlight = liveSelectedItems.length > 0
  const selectionCount = liveSelectedItems.reduce(
    (sum, item) => sum + Math.max(1, Math.floor(item.capacity) || 1),
    0,
  )
  const subtotal = liveSelectedItems.reduce(
    (sum, item) => sum + item.price * Math.max(1, Math.floor(item.capacity) || 1),
    0,
  )
  const stageLabel = map.stage?.label?.trim() || "ESCENARIO"
  const pxPerUnit = (wrapWidth / VIEW.width) * zoom
  const hitRadius = Math.max(8, MIN_HIT_PX / 2 / Math.max(pxPerUnit, 0.05))

  useEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const sync = () => {
      const nextW = node.clientWidth || 360
      const nextH = node.clientHeight || 280
      setWrapWidth((current) => (Math.abs(current - nextW) < 4 ? current : nextW))
      setWrapHeight((current) => (Math.abs(current - nextH) < 4 ? current : nextH))
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  function aabbForItemId(id: string): Aabb | null {
    const element = (map.elements ?? []).find((item) => item.id === id)
    if (element) return elementAabb(element)
    const zone = (map.zones ?? []).find((item) => item.id === id)
    if (zone) return zoneCanvasAabb(zone)
    const seat = plotSeats.find((item) => item.id === id)
    if (!seat) return null
    return {
      minX: seat.x - 10,
      minY: seat.y - 10,
      maxX: seat.x + 10,
      maxY: seat.y + 10,
    }
  }

  function applyContextCamera(ids: string[]) {
    const controls = transformRef.current
    if (!controls) return
    if (ids.length === 0) {
      controls.resetTransform(CONTEXT_FOCUS_ANIM_MS, "easeOut")
      return
    }
    const boxes = ids
      .map((id) => aabbForItemId(id))
      .filter((box): box is Aabb => box != null)
    const union = unionAabb(boxes)
    if (!union) {
      controls.resetTransform(CONTEXT_FOCUS_ANIM_MS, "easeOut")
      return
    }
    const camera = lodCameraTransform(
      expandSelectionForContext(union),
      wrapWidth,
      wrapHeight,
      {
        padding: CONTEXT_FOCUS_PADDING,
        minScale: CONTEXT_FOCUS_MIN_SCALE,
        maxScale: CONTEXT_FOCUS_MAX_SCALE,
      },
    )
    controls.setTransform(
      camera.positionX,
      camera.positionY,
      camera.scale,
      CONTEXT_FOCUS_ANIM_MS,
      "easeOut",
    )
  }

  useEffect(() => {
    if (focusTick <= 0) return
    applyContextCamera(focusedMapIds)
  }, [focusTick, focusedMapIds])

  const assignedFocusKey = liveSelectedItems.map((item) => item.id).join("|")

  useEffect(() => {
    const ids = assignedFocusKey ? assignedFocusKey.split("|") : []
    const timer = window.setTimeout(() => applyContextCamera(ids), 40)
    return () => window.clearTimeout(timer)
  }, [assignedFocusKey, wrapWidth, wrapHeight])

  useEffect(() => {
    if (disableIdlePrompt || selectedSeats.length === 0) {
      return
    }
    lastActivity.current = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= INACTIVITY_MS) {
        setIdleOpen(true)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [selectedSeats.length, disableIdlePrompt])

  function markActivity() {
    stampActivity(lastActivity)
    setIdleOpen(false)
  }

  function seatPrice(...keysAndFallback: Array<string | number>) {
    const fallback = keysAndFallback.find((value) => typeof value === "number")
    const keys = keysAndFallback.filter(
      (value): value is string => typeof value === "string",
    )
    return resolveVenueUnitPrice(keys, Number(fallback) || 0, priceBySectorId)
  }

  function applyToggle(item: StorefrontSelectedItem) {
    const result = toggleSelectedItem(item, maxSelectable)
    if (!result.ok) {
      toast.error(storefrontLimitMessage(result.reason))
      return { ok: false as const, added: false }
    }
    return { ok: true as const, added: result.added }
  }

  function selectZoneItem(zone: VenueMapZone) {
    const item = storefrontItemFromZone(zone, priceBySectorId)
    if (!item) return
    const result = toggleSelectedItem(item, maxSelectable)
    if (!result.ok) {
      toast.error(storefrontLimitMessage(result.reason))
      return
    }
    if (!result.added) return
    onSelectZone?.(zone)
  }

  function zoomToZone(zone: VenueMapZone) {
    const box = zoneCanvasAabb(zone)
    const controls = transformRef.current
    if (!box || !controls) return
    const camera = lodCameraTransform(box, wrapWidth, wrapHeight)
    const node = document.getElementById(`venue-sel-${zone.id}`)
    if (node) {
      controls.zoomToElement(
        node as unknown as HTMLElement,
        camera.scale,
        400,
        "easeOut",
      )
      return
    }
    controls.setTransform(
      camera.positionX,
      camera.positionY,
      camera.scale,
      400,
      "easeOut",
    )
  }

  function enterLodZone(zone: VenueMapZone) {
    vibrateTap()
    markActivity()
    zoomToZone(zone)
    setFocusedZoneId(zone.id)
    setViewMode("micro")
    const hasMicro =
      (map.elements ?? [])
        .filter(isSellableElement)
        .some((element) => elementBelongsToZone(element, zone)) ||
      plotSeats.some((seat) => seatBelongsToZone(seat, zone))
    if (!hasMicro) selectZoneItem(zone)
  }

  function exitLodView() {
    markActivity()
    transformRef.current?.resetTransform(400, "easeOut")
    setViewMode("macro")
    setFocusedZoneId(null)
  }

  function handleZoneClick(zoneId: string, event?: React.SyntheticEvent) {
    event?.stopPropagation()
    if (readOnly || pending) return
    const zone = lodZones.find((item) => item.id === zoneId)
    if (!zone) return
    if (lodEnabled && viewMode === "macro") {
      enterLodZone(zone)
      return
    }
    vibrateTap()
    markActivity()
    selectZoneItem(zone)
  }

  function toggleSeat(seat: FlattenedVenueSeat) {
    if (readOnly) return
    const price = seatPrice(seat.sectorId, seat.price)
    const live = resolveLiveVenueSeatStatus({
      mapStatus: seat.mapStatus,
      occupancy: occupancy[seat.id],
      selected: selectedIds.has(seat.id),
      held: heldSet.has(seat.id),
    })
    if (live === "blocked" || live === "occupied") return

    vibrateTap()
    markActivity()
    if (onPickSeat) {
      onPickSeat({
        id: seat.id,
        row: seat.row,
        number: seat.number,
        sectorId: seat.sectorId,
        sectorName: seat.sectorName,
        price,
        color: seat.color,
      })
      return
    }
    const result = toggleLayoutSeat(
      {
        id: seat.id,
        row: seat.row,
        number: seat.number,
        sectorId: seat.sectorId,
        sectorName: seat.sectorName,
        price,
        color: seat.color,
      },
      maxSelectable,
    )
    if (!result.ok) {
      toast.error(storefrontLimitMessage(result.reason))
    }
  }

  function toggleElement(element: VenueMapElement) {
    if (readOnly) return
    const live = (map.elements ?? []).find((item) => item.id === element.id)
    if (!live || isInfrastructureElement(live) || pending) return
    if (live.type === "vip_chair") {
      const match = plotSeats.find(
        (seat) =>
          seat.id === live.seats[0]?.id ||
          seat.id === live.id ||
          seat.sectorId === live.id,
      )
      if (match) {
        toggleSeat(match)
        return
      }
    }
    if (live.sellMode === "per_seat" && live.type !== "standing_zone") {
      return
    }
    if (onPickElement) {
      vibrateTap()
      markActivity()
      onPickElement(live)
      return
    }
    const item = storefrontItemFromElement(live, priceBySectorId)
    if (!item) return
    vibrateTap()
    markActivity()
    applyToggle(item)
  }

  const continueLabel = pending
    ? "Reservando…"
    : selectionCount > 0
      ? `Continuar con ${selectionCount} ${selectionCount === 1 ? "lugar" : "lugares"}`
      : "Continuar"
  const canContinue = selectionCount > 0 && !pending
  const focusItem = liveSelectedItems[liveSelectedItems.length - 1] ?? null
  const focusCard = focusItem
    ? storefrontFocusCard(focusItem, map)
    : null

  const panel = (
    <aside className="hidden h-full w-[30%] shrink-0 flex-col border-l border-white/10 bg-zinc-950/80 p-5 md:flex">
      <p className="text-sm font-bold text-white">Resumen de tu lugar</p>
      <p className="mt-1 text-sm leading-relaxed text-zinc-400">
        Al continuar, la butaca queda reservada {HOLD_MINUTES} minutos para que
        completes el pago.
      </p>
      <ul className="mt-5 space-y-3">
        {map.sectors.map((sector) => (
          <li key={sector.id} className="flex items-center gap-3 text-base text-zinc-100">
            <span
              className="size-4 rounded-full"
              style={{
                backgroundColor: sector.color,
                boxShadow: `0 0 10px ${hexToRgba(sector.color, 0.7)}`,
              }}
            />
            <span className="min-w-0 flex-1 truncate">{sector.name}</span>
            <span className="text-sm text-zinc-400">
              {formatCurrency(seatPrice(sector.id, sector.price))}
            </span>
          </li>
        ))}
      </ul>

      {focusCard ? (
        <div className="mt-6">
          <StorefrontSelectionCard card={focusCard} />
        </div>
      ) : null}

      <p className="mt-8 text-sm font-bold text-white">
        Lugares seleccionados ({selectionCount})
      </p>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {liveSelectedItems.length === 0 ? (
          <p className="text-base leading-relaxed text-zinc-400">
            Tocá mesas, zonas o butacas para armar tu lista. Un segundo toque
            las saca.
          </p>
        ) : (
          liveSelectedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3"
            >
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: item.color ?? "#34d399" }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-white">
                  {item.name}
                </p>
                {item.capacity > 1 ? (
                  <p className="text-sm text-zinc-300">{item.capacity} lugares</p>
                ) : null}
              </div>
              <p className="text-sm font-semibold text-emerald-300">
                {formatCurrency(item.price * Math.max(1, item.capacity))}
              </p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-11 text-zinc-400 hover:text-white"
                onClick={() => {
                  vibrateTap()
                  removeSelectedItem(item.id)
                  markActivity()
                }}
                aria-label={`Quitar ${item.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base text-zinc-400">Subtotal</span>
          <span className="text-2xl font-black text-white">
            {formatCurrency(subtotal)}
          </span>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!canContinue}
          onClick={() => onContinue(selectedSeats)}
          className="h-12 w-full rounded-2xl bg-emerald-500 py-6 text-base font-black text-black shadow-[0_0_25px_rgba(16,185,129,0.4)] hover:bg-emerald-400"
        >
          {continueLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full text-zinc-400"
            onClick={onBack}
          >
            Volver
          </Button>
        ) : null}
      </div>
    </aside>
  )

  const mapArea = (
      <div
        className={cn(
          "relative min-h-0 min-w-0 flex-1 overflow-hidden",
          hideChrome ? "h-full w-full md:w-full" : "md:w-[70%]",
        hideChrome
          ? "pb-0"
          : fillParent
            ? selectedZoneId
              ? "pb-2 md:pb-14"
              : "pb-[4.75rem] md:pb-14"
            : "pb-[11.5rem] md:pb-14",
        )}
      >
      <TransformWrapper
        ref={transformRef}
        minScale={MIN_ZOOM}
        maxScale={MAX_ZOOM}
        initialScale={1}
        centerOnInit
        centerZoomedOut
        limitToBounds
        smooth
        wheel={{ step: WHEEL_STEP, disabled: readOnly }}
        pinch={{ step: 5, allowPanning: !readOnly, disabled: readOnly }}
        panning={{
          disabled: readOnly,
          velocityDisabled: readOnly,
          allowLeftClickPan: !readOnly,
        }}
        doubleClick={{ disabled: true }}
        zoomAnimation={{
          disabled: false,
          animationTime: ZOOM_ANIM_MS,
          animationType: "easeOut",
        }}
        autoAlignment={{
          disabled: false,
          animationTime: 280,
          animationType: "easeOutCubic",
        }}
        velocityAnimation={{
          disabled: false,
          animationTime: 220,
          animationType: "easeOut",
        }}
        onTransform={(_, state) => {
          setZoom((current) =>
            Math.abs(current - state.scale) < 0.04 ? current : state.scale,
          )
        }}
        onPanningStop={() => markActivity()}
        onPinchStop={() => markActivity()}
      >
      <div
        ref={wrapRef}
        className={cn(
          "h-full w-full",
          readOnly ? "pointer-events-none touch-pan-y" : "touch-none",
        )}
      >
        <TransformComponent
          wrapperClass="!h-full !w-full !overflow-hidden"
          contentClass="!h-full !w-full"
        >
        <svg
          viewBox={`0 ${-VIEW_TOP_PAD} ${VIEW.width} ${VIEW.height + VIEW_TOP_PAD}`}
          className="h-full w-full select-none"
          role="group"
          aria-label={
            readOnly
              ? "Plano del recinto. Vista de confirmación del lugar asignado."
              : "Plano del recinto. Pellizcá para acercar, arrastrá para mover y tocá una zona o butaca."
          }
        >
          <rect
            x={0}
            y={-VIEW_TOP_PAD}
            width={VIEW.width}
            height={VIEW.height + VIEW_TOP_PAD}
            className="fill-zinc-950"
          />
          <g>
            <rect
              x={VIEW.width * 0.18}
              y={-36}
              width={VIEW.width * 0.64}
              height={24}
              rx={8}
              className="pointer-events-none fill-violet-500/25 stroke-violet-400/40"
            />
            <text
              x={VIEW.width / 2}
              y={-19}
              textAnchor="middle"
              dominantBaseline="central"
              className="pointer-events-none fill-violet-200 text-[11px] font-bold tracking-[0.28em]"
            >
              {stageLabel}
            </text>
            <VenueMapBackgroundLayer map={map} />
            {map.aisles.map((aisle) => (
              <rect
                key={aisle.id}
                x={aisle.x}
                y={aisle.y}
                width={aisle.width}
                height={aisle.height}
                rx={8}
                className="pointer-events-none fill-zinc-900 stroke-white/5"
              />
            ))}
            {map.stage ? (
              <rect
                x={map.stage.x}
                y={map.stage.y}
                width={map.stage.width}
                height={map.stage.height}
                rx={12}
                className="pointer-events-none fill-violet-500/20 stroke-violet-400/50"
              />
            ) : null}
            {map.labels.map((label) => (
              <text
                key={label.id}
                x={label.x}
                y={label.y}
                textAnchor="middle"
                fill={label.color}
                className="pointer-events-none text-[13px] font-black tracking-[0.22em]"
              >
                {label.text}
              </text>
            ))}
            <VenueMapElementLayer
              elements={(map.elements ?? []).filter(isInfrastructureElement)}
              showSeats={false}
              zoom={zoom}
              interactive={false}
            />
            <VenueMapZoneLayer
              zones={lodZones}
              selectedId={selectedZoneId}
              selectedIds={selectedZoneIds}
              highlightedIds={focusedMapIds}
              spotlight={spotlight && !lodActive}
              unavailableIds={unavailableZoneIds}
              selectOnPointerUp={!readOnly}
              lodMode={lodEnabled ? viewMode : null}
              focusedZoneId={focusedZoneId}
              onSelect={
                readOnly ? undefined : (zone) => handleZoneClick(zone.id)
              }
            />
            <VenueMapElementLayer
              elements={(map.elements ?? []).filter(
                (element) => !isInfrastructureElement(element),
              )}
              occupancyBySeatId={occupancy}
              selectedIds={[...selectedElementIds, ...heldSeatIds]}
              selectedSeatIds={[...selectedIds, ...heldSeatIds]}
              highlightedIds={focusedMapIds}
              spotlight={spotlight}
              showSeats
              zoom={zoom}
              lodHidden={false}
              visibleIds={microActive ? visibleElementIds : null}
              interactive={!readOnly}
              onSeatPointerDown={(_event, element, seatId) => {
                if (element.sellMode === "group") {
                  toggleElement(element)
                  return
                }
                const match = plotSeats.find((seat) => seat.id === seatId)
                if (match) {
                  toggleSeat(match)
                  return
                }
                toggleElement(element)
              }}
              onElementPointerDown={(_event, element) => {
                toggleElement(element)
              }}
            />
            {[...plotSeats]
              .sort((left, right) => {
                const leftSelected = selectedIds.has(left.id) ? 1 : 0
                const rightSelected = selectedIds.has(right.id) ? 1 : 0
                return leftSelected - rightSelected
              })
              .map((seat) => {
              const price = seatPrice(seat.sectorId, seat.price)
              const live = resolveLiveVenueSeatStatus({
                mapStatus: seat.mapStatus,
                occupancy: occupancy[seat.id],
                selected: selectedIds.has(seat.id),
                held: heldSet.has(seat.id),
              })
              const label = `${seat.sectorName} · Fila ${seat.row} · ${seat.number} — ${formatCurrency(price)}`
              const selected = live === "selected"
              const held = heldSet.has(seat.id)
              const highlighted = focusedMapIds.includes(seat.id)
              const dimmed = spotlight && !selected && !highlighted
              const seatVisible =
                microActive &&
                (!focusedZone ||
                  seatBelongsToZone(seat, focusedZone) ||
                  !focusedHasMicro)
              return (
                <g
                  key={seat.id}
                  id={`venue-sel-${seat.id}`}
                  className={
                    selected || highlighted ? "animate-pulse-subtle" : undefined
                  }
                  style={{
                    opacity: seatVisible ? (dimmed ? 0.7 : 1) : 0,
                    pointerEvents: readOnly || !seatVisible ? "none" : "auto",
                    transition: "opacity 0.3s ease",
                    filter:
                      selected || highlighted
                        ? "drop-shadow(0px 0px 12px rgba(255, 255, 255, 0.8))"
                        : undefined,
                  }}
                >
                  <circle
                    cx={seat.x}
                    cy={seat.y}
                    r={hitRadius}
                    fill="transparent"
                    stroke="none"
                    className={
                      live === "occupied" || live === "blocked"
                        ? "cursor-not-allowed"
                        : "cursor-pointer"
                    }
                    aria-label={label}
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleSeat(seat)
                    }}
                  >
                    <title>{label}</title>
                  </circle>
                  <g
                    opacity={dimmed ? 0.7 : 1}
                    transform={
                      selected || highlighted
                        ? `translate(${seat.x} ${seat.y}) scale(1.15) translate(${-seat.x} ${-seat.y})`
                        : undefined
                    }
                    className="pointer-events-none transition-all duration-200 ease-in-out"
                  >
                    <TheatreSeatSymbol
                      cx={seat.x}
                      cy={seat.y}
                      width={12}
                      height={12}
                      color={posStatusColors ? "#22c55e" : seat.color}
                      selected={selected && !held}
                      occupied={live === "occupied" || live === "blocked"}
                      held={held}
                      label={String(seat.number)}
                      showLabel={zoom >= 1.35 || selected}
                    />
                  </g>
                </g>
              )
            })}
          </g>
        </svg>
        </TransformComponent>
      </div>
      </TransformWrapper>
    </div>
  )

  function handleZoomIn() {
    transformRef.current?.zoomIn(0.2, ZOOM_ANIM_MS, "easeOut")
    markActivity()
  }

  function handleZoomOut() {
    transformRef.current?.zoomOut(0.2, ZOOM_ANIM_MS, "easeOut")
    markActivity()
  }

  function handleResetView() {
    if (lodEnabled && viewMode === "micro") exitLodView()
    else transformRef.current?.resetTransform(280, "easeOut")
    markActivity()
  }

  const shell = (
    <div
      className={cn(
        "flex w-full flex-col",
        fillParent ? "h-full min-h-0" : "h-auto",
      )}
    >
      {readOnly ? null : (
      <ExternalMapToolbar
        showLodBack={lodEnabled && viewMode === "micro"}
        onExitLod={exitLodView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
      />
      )}
      <div
        className={cn(
          "relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-zinc-950 md:flex-row",
          fillParent
            ? "rounded-2xl border border-border"
            : "h-[600px] rounded-3xl border border-white/10 shadow-2xl md:h-[650px]",
        )}
      >
      {mapArea}
      {hideChrome ? null : panel}

      {hideChrome ? null : (
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/90 px-3 py-2.5 backdrop-blur-xl md:hidden pb-[max(0.65rem,env(safe-area-inset-bottom))]",
          selectedZoneId && "hidden",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-white">
              {liveSelectedItems.length === 0
                ? "Elegí tus lugares"
                : formatCurrency(subtotal)}
            </p>
            <p className="truncate text-xs text-zinc-400">
              {selectionCount > 0
                ? `${selectionCount} ${selectionCount === 1 ? "lugar" : "lugares"}`
                : "Un toque suma · otro toque saca"}
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            disabled={!canContinue}
            onClick={() => onContinue(selectedSeats)}
            className="h-11 shrink-0 rounded-2xl bg-emerald-500 px-4 text-sm font-black text-black hover:bg-emerald-400"
          >
            <ArrowRight className="size-4" aria-hidden="true" />
            {continueLabel}
          </Button>
        </div>
      </div>
      )}
      </div>
    </div>
  )

  return (
    <>
      {shell}
      <Dialog
        open={idleOpen && selectedSeats.length > 0 && !disableIdlePrompt}
        onOpenChange={(open) => {
          setIdleOpen(open)
          if (!open) markActivity()
        }}
      >
        <DialogContent className="border-white/10 bg-zinc-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Tu butaca sigue elegida
            </DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-zinc-300">
              Pasaron 5 minutos sin movimiento. Si continuás ahora, la butaca
              queda reservada {HOLD_MINUTES} minutos. Si esperás más, otra
              persona podría tomarla.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-white/10 bg-transparent">
            <Button
              type="button"
              variant="outline"
              className="h-11 border-white/15 text-white"
              onClick={() => {
                markActivity()
                setIdleOpen(false)
              }}
            >
              Seguir eligiendo
            </Button>
            <Button
              type="button"
              disabled={!canContinue}
              className="h-11 bg-emerald-500 font-bold text-black hover:bg-emerald-400"
              onClick={() => {
                markActivity()
                setIdleOpen(false)
                onContinue(selectedSeats)
              }}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ExternalMapToolbar({
  showLodBack,
  onExitLod,
  onZoomIn,
  onZoomOut,
  onResetView,
}: {
  showLodBack: boolean
  onExitLod: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
}) {
  const toolClass =
    "rounded-lg bg-secondary p-1.5 text-xs font-bold transition-all hover:bg-secondary/80"

  return (
    <div className="mb-3 flex items-center justify-between px-1">
      {showLodBack ? (
        <button
          type="button"
          onClick={onExitLod}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-all hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Volver al plano general
        </button>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Plano Interactivo del Recinto
        </span>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Acercar"
          className={toolClass}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          aria-label="Alejar"
          className={toolClass}
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onResetView}
          aria-label="Restablecer vista"
          className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-bold transition-all hover:bg-secondary/80"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Restablecer Vista
        </button>
      </div>
    </div>
  )
}

