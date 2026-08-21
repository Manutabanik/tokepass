"use client"

import {
  ArrowLeft,
  ArrowRight,
  Locate,
  Minus,
  Plus,
  Trash2,
  X,
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
import { storefrontLineTotal } from "@/lib/checkout/charge-unit"
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
  storefrontSelectionTotal,
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
  expandSelectionForContext,
  lodCameraTransform,
  publicRevealElements,
  publicRevealSeats,
  resolveLodZones,
  shouldEnableMapLod,
  zoneCanvasAabb,
  type MapLodMode,
} from "@/lib/seating/venue-map-lod"
import { isInfrastructureElement } from "@/types/venue-map"
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
const REVEAL_MOUNT_MS = 160
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
  hideChrome = false,
  hideToolbar = false,
  toolbarTitle = null,
  onCloseMap,
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
  hideToolbar?: boolean
  toolbarTitle?: string | null
  onCloseMap?: () => void
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
  const [revealedZoneId, setRevealedZoneId] = useState<string | null>(null)
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
  const [occupancyEventId, setOccupancyEventId] = useState(eventId)
  if (eventId !== occupancyEventId) {
    setOccupancyEventId(eventId)
    setLiveOccupancy({})
  }
  const applyOccupancyPatch = useCallback((patch: Record<string, SeatStatus>) => {
    setLiveOccupancy((current) => ({ ...current, ...patch }))
  }, [])
  useSeatingOccupancyRealtime(
    readOnly ? null : eventId,
    applyOccupancyPatch,
    "canvas",
  )
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
  const visibleRevealedZoneId =
    lodEnabled && viewMode === "micro" && focusedZoneId
      ? revealedZoneId
      : null
  const revealReady =
    !lodEnabled ||
    (viewMode === "micro" &&
      Boolean(focusedZone) &&
      visibleRevealedZoneId === focusedZoneId)
  const revealElements = useMemo(() => {
    const sellable = (map.elements ?? []).filter(
      (element) => !isInfrastructureElement(element),
    )
    if (!lodEnabled) return sellable
    if (!revealReady || !focusedZone) return []
    return publicRevealElements(sellable, focusedZone)
  }, [focusedZone, lodEnabled, map.elements, revealReady])
  const revealSeats = useMemo(() => {
    if (!lodEnabled) return plotSeats
    if (!revealReady || !focusedZone) return []
    return publicRevealSeats(plotSeats, focusedZone)
  }, [focusedZone, lodEnabled, plotSeats, revealReady])
  const focusedHasMicro = useMemo(() => {
    if (!focusedZone) return false
    return (
      publicRevealElements(map.elements, focusedZone).length > 0 ||
      publicRevealSeats(plotSeats, focusedZone).length > 0
    )
  }, [focusedZone, map.elements, plotSeats])
  const spotlight = liveSelectedItems.length > 0
  const selectionCount = liveSelectedItems.reduce(
    (sum, item) => sum + Math.max(1, Math.floor(item.capacity) || 1),
    0,
  )
  const subtotal = storefrontSelectionTotal(liveSelectedItems)
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
    if (!lodEnabled || viewMode !== "micro" || !focusedZoneId) {
      return
    }
    const timer = window.setTimeout(() => {
      setRevealedZoneId(focusedZoneId)
    }, REVEAL_MOUNT_MS)
    return () => window.clearTimeout(timer)
  }, [focusedZoneId, lodEnabled, viewMode])

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
    if (!controls || ids.length === 0) return
    const boxes = ids
      .map((id) => aabbForItemId(id))
      .filter((box): box is Aabb => box != null)
    const union = unionAabb(boxes)
    if (!union) return
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

  const applyContextCameraRef = useRef(applyContextCamera)
  useEffect(() => {
    applyContextCameraRef.current = applyContextCamera
  })

  useEffect(() => {
    if (focusTick <= 0) return
    applyContextCameraRef.current(
      useStorefrontSeatStore.getState().focusedMapIds,
    )
  }, [focusTick])

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

  const handleTransformed = useCallback(
    (_ref: unknown, state: { scale: number }) => {
      setZoom((current) =>
        Math.abs(current - state.scale) < 0.04 ? current : state.scale,
      )
    },
    [],
  )
  const wheelOptions = useMemo(
    () => ({ step: WHEEL_STEP, disabled: readOnly }),
    [readOnly],
  )
  const pinchOptions = useMemo(
    () => ({ step: 5, allowPanning: !readOnly, disabled: readOnly }),
    [readOnly],
  )
  const panningOptions = useMemo(
    () => ({
      disabled: readOnly,
      velocityDisabled: readOnly,
      allowLeftClickPan: !readOnly,
    }),
    [readOnly],
  )
  const doubleClickOptions = useMemo(() => ({ disabled: true }), [])
  const zoomAnimationOptions = useMemo(
    () => ({
      disabled: false,
      animationTime: ZOOM_ANIM_MS,
      animationType: "easeOut" as const,
    }),
    [],
  )
  const autoAlignmentOptions = useMemo(
    () => ({
      disabled: true,
      animationTime: 280,
      animationType: "easeOutCubic" as const,
    }),
    [],
  )
  const velocityAnimationOptions = useMemo(
    () => ({
      disabled: false,
      animationTime: 220,
      animationType: "easeOut" as const,
    }),
    [],
  )

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
    if (focusedZoneId !== zone.id) setRevealedZoneId(null)
    zoomToZone(zone)
    setFocusedZoneId(zone.id)
    setViewMode("micro")
    const hasMicro =
      publicRevealElements(map.elements, zone).length > 0 ||
      publicRevealSeats(plotSeats, zone).length > 0
    if (!hasMicro) selectZoneItem(zone)
  }

  function exitLodView() {
    markActivity()
    transformRef.current?.resetTransform(400, "easeOut")
    setViewMode("macro")
    setFocusedZoneId(null)
    setRevealedZoneId(null)
  }

  function handleZoneClick(zoneId: string, event?: React.SyntheticEvent) {
    event?.stopPropagation()
    if (readOnly || pending) return
    const zone = lodZones.find((item) => item.id === zoneId)
    if (!zone) return
    if (lodEnabled && (viewMode === "macro" || zone.id !== focusedZoneId)) {
      enterLodZone(zone)
      return
    }
    if (lodEnabled && focusedHasMicro) return
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
  const showModalActionFooter = Boolean(onCloseMap) && hideChrome
  const focusItem = liveSelectedItems[liveSelectedItems.length - 1] ?? null
  const focusCard = focusItem
    ? storefrontFocusCard(focusItem, map)
    : null

  const panel = (
    <aside className="hidden h-full w-[30%] shrink-0 flex-col border-l border-border bg-card/80 p-5 md:flex">
      <p className="text-sm font-bold text-foreground">Resumen de tu lugar</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Al continuar, la butaca queda reservada {HOLD_MINUTES} minutos para que
        completes el pago.
      </p>
      <ul className="mt-5 space-y-3">
        {map.sectors.map((sector) => (
          <li key={sector.id} className="flex items-center gap-3 text-base text-foreground">
            <span
              className="size-4 rounded-full"
              style={{
                backgroundColor: sector.color,
                boxShadow: `0 0 10px ${hexToRgba(sector.color, 0.7)}`,
              }}
            />
            <span className="min-w-0 flex-1 truncate">{sector.name}</span>
            <span className="text-sm text-muted-foreground">
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

      <p className="mt-8 text-sm font-bold text-foreground">
        Lugares seleccionados ({selectionCount})
      </p>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {liveSelectedItems.length === 0 ? (
          <p className="text-base leading-relaxed text-muted-foreground">
            Tocá mesas, zonas o butacas para armar tu lista. Un segundo toque
            las saca.
          </p>
        ) : (
          liveSelectedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-3"
            >
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: item.color ?? "#34d399" }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-foreground">
                  {item.name}
                </p>
                {item.capacity > 1 ? (
                  <p className="text-sm text-muted-foreground">{item.capacity} lugares</p>
                ) : null}
              </div>
              <p className="text-sm font-semibold text-primary">
                {formatCurrency(storefrontLineTotal(item))}
              </p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-11 text-muted-foreground hover:text-foreground"
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

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base text-muted-foreground">Subtotal</span>
          <span className="text-2xl font-black text-foreground">
            {formatCurrency(subtotal)}
          </span>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!canContinue}
          onClick={() => onContinue(selectedSeats)}
          className="h-12 w-full rounded-2xl bg-primary py-6 text-base font-black text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
        >
          {continueLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full text-muted-foreground"
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
          hideChrome ? "h-full w-full bg-muted md:w-full" : "md:w-[70%]",
        hideChrome
          ? showModalActionFooter
            ? "pb-[max(5.75rem,calc(4.75rem+env(safe-area-inset-bottom)))]"
            : "pb-0"
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
        wheel={wheelOptions}
        pinch={pinchOptions}
        panning={panningOptions}
        doubleClick={doubleClickOptions}
        zoomAnimation={zoomAnimationOptions}
        autoAlignment={autoAlignmentOptions}
        velocityAnimation={velocityAnimationOptions}
        onTransform={handleTransformed}
        onPanningStop={markActivity}
        onPinchStop={markActivity}
      >
      <div
        ref={wrapRef}
        className={cn(
          "h-full w-full",
          hideChrome ? "bg-muted" : "bg-background",
          readOnly ? "pointer-events-none touch-pan-y" : "touch-none",
        )}
      >
        <TransformComponent
          wrapperClass={
            hideChrome
              ? "!h-full !w-full !overflow-hidden !bg-muted"
              : "!h-full !w-full !overflow-hidden !bg-background"
          }
          contentClass={
            hideChrome ? "!h-full !w-full !bg-muted" : "!h-full !w-full !bg-background"
          }
        >
        <svg
          viewBox={`0 ${-VIEW_TOP_PAD} ${VIEW.width} ${VIEW.height + VIEW_TOP_PAD}`}
          className={cn(
            "h-full w-full select-none",
            hideChrome ? "bg-muted" : "bg-background",
          )}
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
            className={hideChrome ? "fill-muted" : "fill-background"}
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
              className="pointer-events-none fill-violet-700 text-[11px] font-bold tracking-[0.28em] dark:fill-violet-200"
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
                className="pointer-events-none fill-foreground/10 stroke-border"
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
            {revealElements.length > 0 || revealSeats.length > 0 ? (
            <g
              key={focusedZoneId ?? "overview"}
              className={lodEnabled ? "venue-map-reveal" : undefined}
            >
            <VenueMapElementLayer
              elements={revealElements}
              occupancyBySeatId={occupancy}
              selectedIds={[...selectedElementIds, ...heldSeatIds]}
              selectedSeatIds={[...selectedIds, ...heldSeatIds]}
              highlightedIds={focusedMapIds}
              spotlight={spotlight}
              showSeats
              zoom={zoom}
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
            {[...revealSeats]
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
              return (
                <g
                  key={seat.id}
                  id={`venue-sel-${seat.id}`}
                  className={cn(
                    !readOnly && "cursor-pointer",
                    (selected || highlighted) && "animate-pulse-subtle",
                  )}
                  style={{
                    opacity: dimmed ? 0.7 : 1,
                    pointerEvents: readOnly ? "none" : "auto",
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
            ) : null}
          </g>
        </svg>
        </TransformComponent>
      </div>
      </TransformWrapper>
      {lodEnabled && viewMode === "micro" && !readOnly ? (
        <button
          type="button"
          onClick={exitLodView}
          className="absolute top-4 left-4 z-40 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-zinc-800"
        >
          Volver al mapa general
        </button>
      ) : null}
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
        fillParent ? "h-full min-h-0" : "flex-1 min-h-0",
        hideChrome && "relative bg-muted",
      )}
    >
      {readOnly || hideToolbar ? null : (
      <div
        className={cn(
          hideChrome &&
            !onCloseMap &&
            "absolute inset-x-0 top-0 z-10 px-3 pt-2",
        )}
      >
      <ExternalMapToolbar
        title={toolbarTitle}
        showLodBack={lodEnabled && viewMode === "micro"}
        selectionCount={liveSelectedItems.length}
        showClear={!readOnly}
        onExitLod={exitLodView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        onClearSelection={() => {
          useStorefrontSeatStore.getState().clearSelectedItems()
        }}
        onClose={onCloseMap}
      />
      </div>
      )}
      <div
        className={cn(
          "relative flex min-h-0 w-full flex-1 flex-col overflow-hidden md:flex-row",
          hideChrome ? "bg-muted" : "bg-background",
          hideChrome
            ? "rounded-none border-0 shadow-none"
            : "relative min-h-0 w-full flex-1 overflow-hidden rounded-lg border border-border bg-muted/20",
          !hideChrome && !fillParent && "min-h-[min(70dvh,36rem)]",
        )}
      >
      {mapArea}
      {hideChrome ? null : panel}

      {hideChrome ? null : (
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-3 py-2.5 backdrop-blur-xl md:hidden pb-[max(0.65rem,env(safe-area-inset-bottom))]",
          selectedZoneId && "hidden",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-foreground">
              {liveSelectedItems.length === 0
                ? "Elegí tus lugares"
                : formatCurrency(subtotal)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
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
            className="h-11 shrink-0 rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground hover:bg-primary/90"
          >
            <ArrowRight className="size-4" aria-hidden="true" />
            {continueLabel}
          </Button>
        </div>
      </div>
      )}
      </div>
      {showModalActionFooter && onCloseMap ? (
        <MapModalActionFooter
          selectionCount={selectionCount}
          onClose={onCloseMap}
        />
      ) : null}
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
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">
              Tu butaca sigue elegida
            </DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-muted-foreground">
              Pasaron 5 minutos sin movimiento. Si continuás ahora, la butaca
              queda reservada {HOLD_MINUTES} minutos. Si esperás más, otra
              persona podría tomarla.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-border bg-transparent">
            <Button
              type="button"
              variant="outline"
              className="h-11"
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
              className="h-11 bg-primary font-bold text-primary-foreground hover:bg-primary/90"
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

function MapModalActionFooter({
  selectionCount,
  onClose,
}: {
  selectionCount: number
  onClose: () => void
}) {
  const hasSelection = selectionCount > 0
  const label = hasSelection
    ? `Confirmar ${selectionCount} ${selectionCount === 1 ? "lugar" : "lugares"}`
    : "Volver al resumen"

  return (
    <div className="absolute bottom-0 left-0 z-10 flex w-full justify-center border-t border-border bg-background/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-lg">
      <button
        type="button"
        onClick={onClose}
        className={cn(
          "w-full max-w-md rounded-xl py-3.5 text-lg font-bold transition-all duration-200",
          hasSelection
            ? "bg-primary text-primary-foreground shadow-[0_0_15px_color-mix(in_srgb,var(--primary)_30%,transparent)] hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_0_25px_color-mix(in_srgb,var(--primary)_45%,transparent)]"
            : "border border-border bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
        )}
      >
        {label}
      </button>
    </div>
  )
}

function ExternalMapToolbar({
  title,
  showLodBack,
  selectionCount,
  showClear,
  onExitLod,
  onZoomIn,
  onZoomOut,
  onResetView,
  onClearSelection,
  onClose,
}: {
  title?: string | null
  showLodBack: boolean
  selectionCount: number
  showClear: boolean
  onExitLod: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  onClearSelection: () => void
  onClose?: () => void
}) {
  const hasSelection = showClear && selectionCount > 0
  const heading = showLodBack ? "Volver al mapa general" : title?.trim()
  const toolClass =
    "grid size-10 place-items-center rounded-md text-foreground transition-all duration-200 hover:bg-background/80"

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-4 p-4">
      <div className="min-w-0 flex-1">
        {showLodBack ? (
          <button
            type="button"
            onClick={onExitLod}
            className="inline-flex min-h-11 max-w-full items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-all duration-200 hover:text-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{heading}</span>
          </button>
        ) : heading ? (
          <p className="truncate text-sm font-bold text-foreground">{heading}</p>
        ) : (
          <span className="sr-only">Mapa del recinto</span>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {hasSelection ? (
          <button
            type="button"
            onClick={onClearSelection}
            className="flex min-h-11 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-destructive transition-all duration-200 hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Desmarcar todo
          </button>
        ) : null}
        {hasSelection ? (
          <span className="mx-2 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        ) : null}
        <div className="flex items-center gap-1 rounded-lg bg-secondary/80 p-1">
          <button
            type="button"
            onClick={onZoomIn}
            aria-label="Acercar"
            className={toolClass}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onZoomOut}
            aria-label="Alejar"
            className={toolClass}
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onResetView}
            aria-label="Centrar mapa"
            className={toolClass}
          >
            <Locate className="size-4" aria-hidden="true" />
          </button>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-1 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-bold text-foreground transition-all duration-200 hover:bg-secondary/80"
          >
            <X className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Cerrar</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}

