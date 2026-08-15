"use client"

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Crosshair,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  TransformComponent,
  TransformWrapper,
  useControls,
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

import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
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
import {
  elementBelongsToZone,
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
const HOLD_MINUTES = 8
const INACTIVITY_MS = 5 * 60 * 1000
const MIN_HIT_PX = 44

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
  maxSelectable = MAX_TICKETS_PER_PURCHASE,
}: {
  map: InteractiveVenueMap
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
  maxSelectable?: number
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
  const [popoverId, setPopoverId] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState({ x: 24, y: 72 })
  const selectedItems = useStorefrontSeatStore((state) => state.selectedItems)
  const selectedSeats = useStorefrontSeatStore((state) => state.layoutSeats)
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

  function placePopover(id: string) {
    const wrap = wrapRef.current
    const node = document.getElementById(`venue-sel-${id}`)
    if (!wrap) {
      setPopoverId(id)
      return
    }
    const wr = wrap.getBoundingClientRect()
    if (node) {
      const nr = node.getBoundingClientRect()
      setPopoverPos({
        x: Math.min(Math.max(16, nr.left + nr.width / 2 - wr.left), wr.width - 16),
        y: Math.min(Math.max(16, nr.top - wr.top - 10), wr.height - 16),
      })
    } else {
      setPopoverPos({ x: wr.width / 2, y: 72 })
    }
    setPopoverId(id)
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
      toast.error("Alcanzaste el máximo de lugares permitidos por compra")
      return { ok: false as const, added: false }
    }
    return { ok: true as const, added: result.added }
  }

  function selectZoneItem(zone: VenueMapZone) {
    const item = storefrontItemFromZone(zone, priceBySectorId)
    if (!item) return
    const result = toggleSelectedItem(item, maxSelectable)
    if (!result.ok) {
      toast.error("Alcanzaste el máximo de lugares permitidos por compra")
      return
    }
    if (!result.added) {
      setPopoverId(null)
      return
    }
    onSelectZone?.(zone)
    requestAnimationFrame(() => placePopover(zone.id))
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
    if (pending) return
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
    const price = seatPrice(seat.sectorId, seat.price)
    const live = resolveLiveVenueSeatStatus({
      mapStatus: seat.mapStatus,
      occupancy: occupancyBySeatId[seat.id],
      selected: selectedIds.has(seat.id),
    })
    if (live === "blocked" || live === "occupied") return

    vibrateTap()
    markActivity()
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
      toast.error("Alcanzaste el máximo de lugares permitidos por compra")
      return
    }
    if (result.added) requestAnimationFrame(() => placePopover(seat.id))
    else setPopoverId((current) => (current === seat.id ? null : current))
  }

  function toggleElement(element: VenueMapElement) {
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
    const item = storefrontItemFromElement(live, priceBySectorId)
    if (!item) return
    vibrateTap()
    markActivity()
    const result = applyToggle(item)
    if (!result.ok) return
    if (result.added) requestAnimationFrame(() => placePopover(live.id))
    else setPopoverId((current) => (current === live.id ? null : current))
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
  const popoverItem =
    liveSelectedItems.find((item) => item.id === popoverId) ?? focusItem
  const popoverCard = popoverItem
    ? storefrontFocusCard(popoverItem, map)
    : null
  const popoverChairs = Math.max(
    1,
    Math.floor(popoverItem?.capacity ?? 1) || 1,
  )

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
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-3 md:px-6">
        <div className="mx-auto w-2/3 rounded-b-2xl border-b border-violet-500/50 bg-gradient-to-r from-violet-600/30 via-violet-500/50 to-violet-600/30 py-1.5 text-center text-[10px] font-bold tracking-widest text-violet-200 uppercase md:py-2 md:text-xs">
          {stageLabel}
        </div>
      </div>

      {lodEnabled && viewMode === "micro" ? (
        <div className="absolute top-3 left-3 z-30">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exitLodView}
            className="h-8 gap-1.5 border-white/15 bg-zinc-950/85 px-2.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-800"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Volver al plano general
          </Button>
        </div>
      ) : onBack && fillParent ? (
        <div className="absolute top-3 left-3 z-20">
          <IconBtn label="Cerrar el plano" onClick={onBack}>
            <X className="size-5" />
          </IconBtn>
        </div>
      ) : null}

      <TransformWrapper
        ref={transformRef}
        minScale={MIN_ZOOM}
        maxScale={MAX_ZOOM}
        initialScale={1}
        centerOnInit
        centerZoomedOut
        limitToBounds
        smooth
        wheel={{ step: WHEEL_STEP }}
        pinch={{ step: 5, allowPanning: true }}
        panning={{ velocityDisabled: false, allowLeftClickPan: true }}
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
        <MapViewportControls
          onActivity={markActivity}
          onReset={lodEnabled ? exitLodView : undefined}
        />
      <div ref={wrapRef} className="h-full w-full touch-none">
        <TransformComponent
          wrapperClass="!h-full !w-full !overflow-hidden"
          contentClass="!h-full !w-full"
        >
        <svg
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          className="h-full w-full select-none"
          role="group"
          aria-label="Plano del recinto. Pellizcá para acercar, arrastrá para mover y tocá una zona o butaca."
        >
          <rect width={VIEW.width} height={VIEW.height} className="fill-zinc-950" />
          <g>
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
              spotlight={spotlight && !lodActive}
              unavailableIds={unavailableZoneIds}
              selectOnPointerUp
              lodMode={lodEnabled ? viewMode : null}
              focusedZoneId={focusedZoneId}
              onSelect={(zone) => handleZoneClick(zone.id)}
            />
            <VenueMapElementLayer
              elements={(map.elements ?? []).filter(
                (element) => !isInfrastructureElement(element),
              )}
              occupancyBySeatId={occupancyBySeatId}
              selectedIds={selectedElementIds}
              selectedSeatIds={[...selectedIds]}
              spotlight={spotlight}
              showSeats
              zoom={zoom}
              lodHidden={false}
              visibleIds={microActive ? visibleElementIds : null}
              interactive
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
                occupancy: occupancyBySeatId[seat.id],
                selected: selectedIds.has(seat.id),
              })
              const label = `${seat.sectorName} · Fila ${seat.row} · ${seat.number} — ${formatCurrency(price)}`
              const selected = live === "selected"
              const dimmed = spotlight && !selected
              const seatVisible =
                microActive &&
                (!focusedZone ||
                  seatBelongsToZone(seat, focusedZone) ||
                  !focusedHasMicro)
              return (
                <g
                  key={seat.id}
                  id={`venue-sel-${seat.id}`}
                  style={{
                    opacity: seatVisible ? 1 : 0,
                    pointerEvents: seatVisible ? "auto" : "none",
                    transition: "opacity 0.3s ease",
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
                    opacity={dimmed ? 0.4 : 1}
                    transform={
                      selected
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
                      color={seat.color}
                      selected={selected}
                      occupied={live === "occupied" || live === "blocked"}
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

      {focusCard && !hideChrome && !popoverId ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 hidden md:left-3 md:block md:w-[min(100%-1.5rem,20rem)]">
          <StorefrontSelectionCard card={focusCard} />
        </div>
      ) : null}

      {popoverId && popoverCard ? (
        <div
          className="pointer-events-none absolute z-40 w-[min(18.5rem,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-full"
          style={{ left: popoverPos.x, top: popoverPos.y }}
        >
          <div className="pointer-events-auto rounded-2xl border border-white/15 bg-zinc-950/95 p-3 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
            <p className="text-sm font-bold leading-tight">{popoverCard.title}</p>
            <p className="mt-0.5 truncate text-xs text-zinc-400">
              {popoverCard.sector}
            </p>
            <p className="mt-2 text-xs font-medium text-zinc-300">
              {popoverChairs === 1
                ? "1 Butaca incluida"
                : `${popoverChairs} Butacas incluidas`}
            </p>
            <p className="mt-1 text-lg font-black tabular-nums text-emerald-300">
              {formatCurrency(popoverCard.price)}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={!canContinue}
              onClick={() => {
                markActivity()
                const seats =
                  selectedSeats.length > 0
                    ? selectedSeats
                    : liveSelectedItems.map((item) => ({
                        id: item.id,
                        row: item.row ?? "",
                        number: item.number ?? 0,
                        sectorId: item.sectorId ?? item.id,
                        sectorName: item.name.split(" · ")[0] ?? item.name,
                        price: item.price,
                        color: item.color ?? "#34d399",
                      }))
                onContinue(seats)
              }}
              className="mt-3 h-10 w-full rounded-xl bg-emerald-500 text-xs font-black text-black hover:bg-emerald-400"
            >
              Seleccionar y Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {hideChrome ? null : (
      <div
        className={cn(
          "absolute inset-x-0 z-20 hidden px-3 md:bottom-3 md:block",
          fillParent ? "md:bottom-3" : "bottom-[7.25rem] md:bottom-3",
        )}
      >
        <div className="flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-sm text-zinc-100 backdrop-blur-xl md:text-base">
          <span className="inline-flex items-center gap-2">
            <Circle className="h-4 w-4 fill-emerald-500/30 stroke-emerald-500 text-emerald-500" />
            Libre
          </span>
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 fill-emerald-400 text-black" />
            Seleccionado por vos
          </span>
          <span className="inline-flex items-center gap-2">
            <XCircle className="h-4 w-4 fill-zinc-800 text-zinc-600" />
            Ocupado
          </span>
        </div>
      </div>
      )}
    </div>
  )

  const shell = (
    <div
      className={cn(
        "relative flex w-full flex-col overflow-hidden bg-zinc-950 md:flex-row",
        fillParent
          ? "h-full min-h-0 rounded-none border-0 shadow-none"
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

function MapViewportControls({
  onActivity,
  onReset,
}: {
  onActivity: () => void
  onReset?: () => void
}) {
  const { resetTransform, zoomIn, zoomOut, centerView } = useControls()
  const toolClass =
    "size-8 border-white/10 bg-zinc-950/80 p-0 text-zinc-100 shadow-sm hover:bg-zinc-800"

  return (
    <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Acercar"
        className={toolClass}
        onClick={() => {
          zoomIn(0.2, ZOOM_ANIM_MS, "easeOut")
          onActivity()
        }}
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Alejar"
        className={toolClass}
        onClick={() => {
          zoomOut(0.2, ZOOM_ANIM_MS, "easeOut")
          onActivity()
        }}
      >
        <Minus className="size-3.5" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        aria-label="Centrar el plano"
        className="h-8 gap-1.5 border-white/10 bg-zinc-950/80 px-2.5 text-xs font-semibold text-zinc-100 shadow-sm hover:bg-zinc-800"
        onClick={() => {
          centerView(1, 280, "easeOutCubic")
          onActivity()
        }}
      >
        <Crosshair className="size-3.5" aria-hidden="true" />
        Centrar
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          if (onReset) onReset()
          else resetTransform(280, "easeOut")
          onActivity()
        }}
        aria-label="Restablecer"
        className="h-8 gap-1.5 border-white/10 bg-zinc-950/70 px-2.5 text-xs font-semibold text-zinc-100 shadow-sm hover:bg-zinc-800"
      >
        <RotateCcw className="size-3.5" aria-hidden="true" />
        Restablecer
      </Button>
    </div>
  )
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      aria-label={label}
      onClick={onClick}
      className="size-11 border-white/10 bg-zinc-950/80 text-zinc-100 hover:bg-zinc-800"
    >
      {children}
    </Button>
  )
}

