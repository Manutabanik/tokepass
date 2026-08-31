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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
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

import { useSeatHoldsRealtime } from "@/hooks/use-seat-holds-realtime"
import { useSeatingOccupancyRealtime } from "@/hooks/use-seating-occupancy-realtime"
import { SEATING_HOLD_MINUTES } from "@/lib/checkout-hold"
import { storefrontLimitMessage } from "@/lib/checkout-limits"
import {
  mergeInventoryOccupancy,
  SEAT_HELD_BY_OTHER_MESSAGE,
} from "@/lib/seating/inventory-seat-state"
import { storefrontLineTotal } from "@/lib/checkout/charge-unit"
import { cartPlaceLabel } from "@/lib/checkout/cart-lines"
import {
  asHoldEventDateId,
  storefrontItemMatchesSchedule,
  storefrontSelectionKey,
  withCheckoutEventDateId,
} from "@/lib/checkout/seat-hold-day"
import { formatCurrency } from "@/lib/format"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { flattenVenueMapSeats, type FlattenedVenueSeat } from "@/lib/seating/venue-map-geometry"
import {
  expandOccupancyToVenueMap,
  hexToRgba,
  lookupOccupancyStatus,
  resolveLiveVenueSeatStatus,
} from "@/lib/seating/venue-map-occupancy"
import {
  hydrateStorefrontItemsFromMap,
  isTablePurchaseSku,
  resolveElementPublicPrice,
  resolveVenueUnitPrice,
  storefrontFocusCard,
  storefrontHoldSectorId,
  storefrontItemFromElement,
  storefrontItemFromElementSeat,
  storefrontItemFromZone,
} from "@/lib/seating/storefront-selection"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import {
  BuyerMapZoomDock,
  SeatTooltip,
  clampTooltipPosition,
  resolveBuyerHoverFromTarget,
  type BuyerMapHoverItem,
} from "@/components/public/seat-tooltip"
import { StorefrontSelectionCard } from "@/components/public/storefront-selection-card"
import { VenueMapBackgroundLayer } from "@/components/venue/venue-map-background-layer"
import { VenueMapElementLayer } from "@/components/venue/venue-map-element-layer"
import { VenueMapZoneLayer } from "@/components/venue/venue-map-zone-layer"
import { TheatreSeatSymbol } from "@/components/admin/venue-svg-symbols"
import {
  storefrontSelectionCount,
  storefrontSelectionTotal,
  useStorefrontSeatStore,
  type StorefrontSelectedItem,
} from "@/lib/stores/storefront-seat-store"
import { cn } from "@/lib/utils"
import {
  buyerSelectionUnitIds,
  paintBuyerMapSelection,
  shouldRestoreBuyerViewport,
} from "@/lib/seating/buyer-map-selection-paint"
import { elementAabb, unionAabb, type Aabb } from "@/lib/seating/venue-transform"
import {
  CONTEXT_FOCUS_ANIM_MS,
  CONTEXT_FOCUS_MAX_SCALE,
  CONTEXT_FOCUS_MIN_SCALE,
  CONTEXT_FOCUS_PADDING,
  CLIENT_FIT_MAX_SCALE,
  buyerViewportFitSessionKey,
  drawableContentAabb,
  expandSelectionForContext,
  fitDrawableContentCamera,
  lodCameraTransform,
  publicRevealElements,
  publicRevealSeats,
  resolveLodZones,
  shouldEnableMapLod,
  shouldRunBuyerAutoFit,
  zoneCanvasAabb,
  type BuyerMapViewport,
  type MapLodMode,
} from "@/lib/seating/venue-map-lod"
import {
  listUncontainedSellableElements,
  mapClickTargetFromElement,
  mapClickTargetFromZone,
} from "@/lib/seating/map-click-target"
import { resolveEffectiveSeatingType } from "@/lib/seating/seating-type"
import type { MapClickTarget } from "@/types/event-map"
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
const HOLD_MINUTES = SEATING_HOLD_MINUTES
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

function buyerMapSurfaceClass(hideChrome: boolean, buyerChrome: boolean) {
  if (buyerChrome) return "bg-transparent"
  if (hideChrome) return "bg-background/50"
  return "bg-background"
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
  posWorkstation = false,
  buyerChrome = false,
  silentHover = false,
  scheduleDayCount = 0,
  eventDateId: eventDateIdProp = null,
  zoomDockClassName,
  lodBackClassName,
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
  posWorkstation?: boolean
  buyerChrome?: boolean
  scheduleDayCount?: number
  eventDateId?: string | null
  zoomDockClassName?: string
  lodBackClassName?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const tooltipHostRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef<ReactZoomPanPinchContentRef>(null)
  const lastActivity = useRef(0)
  const touchHoverRef = useRef(false)
  const touchHoverTimer = useRef<number | null>(null)

  const [zoom, setZoom] = useState(1)
  const [hoveredItem, setHoveredItem] = useState<BuyerMapHoverItem | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 16, y: 16 })
  const [wrapWidth, setWrapWidth] = useState(360)
  const [wrapHeight, setWrapHeight] = useState(280)
  const [idleOpen, setIdleOpen] = useState(false)
  const [viewMode, setViewMode] = useState<MapLodMode>("macro")
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null)
  const [revealedZoneId, setRevealedZoneId] = useState<string | null>(null)
  const storeScheduleId = useCheckoutStore((state) => state.selectedScheduleId)
  const activeScheduleId = eventDateIdProp?.trim() || storeScheduleId
  const mapScheduleId = asHoldEventDateId(activeScheduleId)
  const selectionIdsRef = useRef<Set<string>>(new Set())
  const selectionQuietRef = useRef(false)
  const selectionQuietTimer = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const toggleSelectedItem = useStorefrontSeatStore(
    (state) => state.toggleSelectedItem,
  )
  const toggleLayoutSeat = useStorefrontSeatStore((state) => state.toggleLayoutSeat)
  const plotSeats = useMemo(() => {
    const zoneIds = new Set((map.zones ?? []).map((zone) => zone.id))
    return flattenVenueMapSeats(map).filter(
      (seat) => seat.source === "sector" && !zoneIds.has(seat.sectorId),
    )
  }, [map])
  const [liveOccupancy, setLiveOccupancy] = useState<Record<string, SeatStatus>>(
    {},
  )
  const occupancyScopeKey = `${eventId ?? ""}::${activeScheduleId ?? ""}`
  const [occupancyScope, setOccupancyScope] = useState(occupancyScopeKey)
  if (occupancyScopeKey !== occupancyScope) {
    setOccupancyScope(occupancyScopeKey)
    setLiveOccupancy({})
  }
  const applyOccupancyPatch = useCallback((patch: Record<string, SeatStatus>) => {
    setLiveOccupancy((current) => mergeInventoryOccupancy(current, patch))
  }, [])
  useSeatingOccupancyRealtime(
    readOnly ? null : eventId,
    applyOccupancyPatch,
    "canvas",
    activeScheduleId,
    scheduleDayCount,
  )
  useSeatHoldsRealtime(
    eventId,
    applyOccupancyPatch,
    "canvas",
    activeScheduleId,
    scheduleDayCount,
  )
  const occupancy = useMemo(
    () =>
      expandOccupancyToVenueMap(
        mergeInventoryOccupancy(occupancyBySeatId, liveOccupancy),
        map,
      ),
    [liveOccupancy, map, occupancyBySeatId],
  )
  const inventoryRev = useMemo(() => {
    let sold = 0
    let held = 0
    for (const status of Object.values(occupancy)) {
      if (status === "occupied" || status === "blocked") sold += 1
      else if (status === "held") held += 1
    }
    return `${sold}:${held}:${Object.keys(occupancy).length}`
  }, [occupancy])
  const heldSet = useMemo(() => new Set(heldSeatIds), [heldSeatIds])
  const hoverSeats = useMemo(() => flattenVenueMapSeats(map), [map])
  const buyerOccupancy = !posStatusColors
  const lodEnabled = shouldEnableMapLod(map)
  const lodZones = useMemo(() => resolveLodZones(map), [map])
  const focusedZone = useMemo(
    () => lodZones.find((zone) => zone.id === focusedZoneId) ?? null,
    [focusedZoneId, lodZones],
  )
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
    if (viewMode === "macro") return listUncontainedSellableElements(map)
    if (!revealReady || !focusedZone) return []
    return publicRevealElements(sellable, focusedZone)
  }, [focusedZone, lodEnabled, map, revealReady, viewMode])
  const revealSeats = useMemo(() => {
    if (!lodEnabled) return plotSeats
    if (viewMode === "macro") {
      const reservedIds = new Set(
        (map.zones ?? [])
          .filter((zone) => resolveEffectiveSeatingType(zone, map) === "RESERVED")
          .map((zone) => zone.id),
      )
      return plotSeats.filter((seat) => !reservedIds.has(seat.sectorId))
    }
    if (!revealReady || !focusedZone) return []
    return publicRevealSeats(plotSeats, focusedZone)
  }, [focusedZone, lodEnabled, map, plotSeats, revealReady, viewMode])
  const buyerFitBox = useMemo(
    () =>
      buyerChrome
        ? drawableContentAabb({
            elements: revealElements,
            seats: revealSeats,
            zones: map.zones,
          })
        : null,
    [buyerChrome, map.zones, revealElements, revealSeats],
  )
  const stageLabel = map.stage?.label?.trim() || "ESCENARIO"
  const pxPerUnit = (wrapWidth / VIEW.width) * zoom
  const hitRadius = Math.max(8, MIN_HIT_PX / 2 / Math.max(pxPerUnit, 0.05))

  useEffect(() => {
    return () => {
      if (touchHoverTimer.current != null) {
        window.clearTimeout(touchHoverTimer.current)
      }
    }
  }, [])

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

  const viewportSessionKey = buyerViewportFitSessionKey(eventId, mapScheduleId)
  const fittedSessionRef = useRef<string | null>(null)
  const savedViewportRef = useRef<BuyerMapViewport | null>(null)
  if (
    fittedSessionRef.current &&
    fittedSessionRef.current !== viewportSessionKey
  ) {
    fittedSessionRef.current = null
    savedViewportRef.current = null
  }

  const applyBuyerContentFit = useCallback(
    (animate: boolean) => {
      if (!buyerChrome || viewMode !== "macro") return false
      if (wrapWidth < 80 || wrapHeight < 80 || !buyerFitBox) return false
      const controls = transformRef.current
      if (!controls) return false
      const camera = fitDrawableContentCamera(buyerFitBox, wrapWidth, wrapHeight)
      controls.setTransform(
        camera.positionX,
        camera.positionY,
        camera.scale,
        animate ? 280 : 0,
        "easeOut",
      )
      savedViewportRef.current = {
        scale: camera.scale,
        positionX: camera.positionX,
        positionY: camera.positionY,
      }
      return true
    },
    [buyerChrome, buyerFitBox, viewMode, wrapHeight, wrapWidth],
  )

  useEffect(() => {
    if (!buyerChrome) return
    if (
      !shouldRunBuyerAutoFit({
        sessionKey: viewportSessionKey,
        fittedSessionKey: fittedSessionRef.current,
        viewMode,
        wrapWidth,
        wrapHeight,
      })
    ) {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      if (applyBuyerContentFit(true)) {
        fittedSessionRef.current = viewportSessionKey
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [
    applyBuyerContentFit,
    buyerChrome,
    viewMode,
    viewportSessionKey,
    wrapHeight,
    wrapWidth,
  ])

  function readSelectionIds() {
    const store = useStorefrontSeatStore.getState()
    return buyerSelectionUnitIds({
      selectedItems: store.selectedItems,
      layoutSeats: store.layoutSeats,
      cartLines: useCheckoutStore.getState().lines,
      map,
      mapScheduleId,
      scheduleDayCount,
    })
  }

  function syncSelectionPaint() {
    selectionIdsRef.current = readSelectionIds()
    paintBuyerMapSelection(
      svgRef.current,
      selectionIdsRef.current,
      useStorefrontSeatStore.getState().focusedMapIds,
    )
  }

  function armSelectionQuiet() {
    selectionQuietRef.current = true
    if (selectionQuietTimer.current != null) {
      window.clearTimeout(selectionQuietTimer.current)
    }
    selectionQuietTimer.current = window.setTimeout(() => {
      selectionQuietRef.current = false
      selectionQuietTimer.current = null
    }, 160)
  }

  useLayoutEffect(() => {
    syncSelectionPaint()
  }, [inventoryRev, viewMode, focusedZoneId, revealReady, map])

  useEffect(() => {
    syncSelectionPaint()
    return useStorefrontSeatStore.subscribe((state, prev) => {
      if (state.selectedItems !== prev.selectedItems) armSelectionQuiet()
      if (
        state.selectedItems !== prev.selectedItems ||
        state.layoutSeats !== prev.layoutSeats ||
        state.focusedMapIds !== prev.focusedMapIds
      ) {
        syncSelectionPaint()
      }
      if (state.focusTick !== prev.focusTick && state.focusTick > 0) {
        applyContextCameraRef.current(state.focusedMapIds)
      }
    })
  }, [map, mapScheduleId, scheduleDayCount])

  useEffect(() => {
    return useCheckoutStore.subscribe((state, prev) => {
      if (state.lines === prev.lines) return
      syncSelectionPaint()
    })
  }, [map, mapScheduleId, scheduleDayCount])

  useEffect(() => {
    return () => {
      if (selectionQuietTimer.current != null) {
        window.clearTimeout(selectionQuietTimer.current)
      }
    }
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
    if (disableIdlePrompt) return
    lastActivity.current = Date.now()
    const timer = window.setInterval(() => {
      const hasSeats = useStorefrontSeatStore.getState().layoutSeats.length > 0
      if (hasSeats && Date.now() - lastActivity.current >= INACTIVITY_MS) {
        setIdleOpen(true)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [disableIdlePrompt])

  function markActivity() {
    stampActivity(lastActivity)
    setIdleOpen(false)
  }

  const handleTransformed = useCallback(
    (
      _ref: unknown,
      state: { scale: number; positionX: number; positionY: number },
    ) => {
      const saved = savedViewportRef.current
      if (
        saved &&
        shouldRestoreBuyerViewport({
          current: state,
          saved,
          selectionQuiet: selectionQuietRef.current,
        })
      ) {
        transformRef.current?.setTransform(
          saved.positionX,
          saved.positionY,
          saved.scale,
          0,
        )
        return
      }
      savedViewportRef.current = {
        scale: state.scale,
        positionX: state.positionX,
        positionY: state.positionY,
      }
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
    () => ({
      step: 5,
      allowPanning: !readOnly,
      disabled: readOnly,
    }),
    [readOnly],
  )
  const panningOptions = useMemo(
    () => ({
      disabled: readOnly,
      velocityDisabled: false,
      allowLeftClickPan: !readOnly,
      excluded: ["input", "button", "textarea"],
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
    return resolveVenueUnitPrice(
      keys,
      fallback === undefined || fallback === null ? 0 : Number(fallback),
      priceBySectorId,
    )
  }

  const hoverLookup = useMemo(() => {
    const seatById = new Map<string, BuyerMapHoverItem>()
    for (const seat of hoverSeats) {
      const live = resolveLiveVenueSeatStatus({
        mapStatus: seat.mapStatus,
        occupancy: lookupOccupancyStatus(occupancy, seat.id),
        selected: selectionIdsRef.current.has(seat.id),
        held: heldSet.has(seat.id),
      })
      const item = {
        sectorName: seat.sectorName,
        row: seat.row,
        seatNumber: seat.number,
        price: resolveVenueUnitPrice(
          [seat.sectorId],
          seat.price === undefined || seat.price === null
            ? 0
            : Number(seat.price),
          priceBySectorId,
        ),
        heldByOther: live === "held",
      }
      seatById.set(seat.id, item)
    }
    const zoneById = new Map<string, BuyerMapHoverItem>()
    for (const zone of map.zones ?? []) {
      zoneById.set(zone.id, {
        sectorName: zone.name,
        price: resolveVenueUnitPrice(
          [zone.id],
          zone.price === undefined || zone.price === null
            ? 0
            : Number(zone.price),
          priceBySectorId,
        ),
      })
    }
    const elementById = new Map<string, BuyerMapHoverItem>()
    for (const element of map.elements ?? []) {
      if (isInfrastructureElement(element)) continue
      const elementLive = resolveLiveVenueSeatStatus({
        mapStatus: "available",
        occupancy: lookupOccupancyStatus(
          occupancy,
          element.id,
          ...element.seats.map((seat) => seat.id),
        ),
        selected: selectionIdsRef.current.has(element.id),
        held: heldSet.has(element.id),
      })
      const heldByOther =
        elementLive === "held" ||
        element.seats.some((seat) => {
          if (selectionIdsRef.current.has(seat.id) || heldSet.has(seat.id)) return false
          return lookupOccupancyStatus(occupancy, seat.id, element.id) === "held"
        })
      elementById.set(element.id, {
        sectorName:
          element.groupName ||
          element.sectorName ||
          element.customLabel ||
          element.label ||
          "Sector",
        price: resolveElementPublicPrice(element, priceBySectorId, map),
        heldByOther,
      })
    }
    return { seatById, zoneById, elementById }
  }, [
    heldSet,
    hoverSeats,
    map,
    occupancy,
    priceBySectorId,
  ])

  function updateHoverFromEvent(event: React.PointerEvent) {
    if (silentHover) return
    const host = tooltipHostRef.current
    if (!host) return
    const item = resolveBuyerHoverFromTarget(event.target, hoverLookup)
    if (!item) {
      if (event.pointerType !== "touch") setHoveredItem(null)
      return
    }
    const rect = host.getBoundingClientRect()
    setHoveredItem(item)
    setHoverPos(
      clampTooltipPosition(
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height,
        item,
      ),
    )
  }

  function canvasSeatLabel(item: StorefrontSelectedItem) {
    return (
      item.seatLabel?.trim() ||
      item.displayName?.trim() ||
      cartPlaceLabel(item) ||
      item.name?.trim() ||
      ""
    )
  }

  function stampCanvasSelection(item: StorefrontSelectedItem) {
    const seatLabel = canvasSeatLabel(item)
    return withCheckoutEventDateId(
      item,
      useCheckoutStore.getState().selectedScheduleId,
      { seatLabel },
    )
  }

  function applyToggle(item: StorefrontSelectedItem) {
    const stamped = stampCanvasSelection(item)
    armSelectionQuiet()
    const result = toggleSelectedItem(stamped, maxSelectable)
    if (!result.ok) {
      toast.error(storefrontLimitMessage(result.reason))
      return { ok: false as const, added: false }
    }
    syncSelectionPaint()
    return { ok: true as const, added: result.added }
  }

  function selectGeneralZone(zone: VenueMapZone) {
    if (onSelectZone) {
      onSelectZone(zone)
      return
    }
    const item = storefrontItemFromZone(zone, priceBySectorId)
    if (!item) return
    armSelectionQuiet()
    const result = useStorefrontSeatStore
      .getState()
      .incrementSelectedItem(stampCanvasSelection(item), maxSelectable)
    if (!result.ok) {
      toast.error(storefrontLimitMessage(result.reason))
      return
    }
    syncSelectionPaint()
  }

  function handleMapTargetClick(target: MapClickTarget) {
    if (readOnly || pending) return
    if (target.type === "SECTOR_GENERAL") {
      vibrateTap()
      markActivity()
      selectGeneralZone(target.zone)
      return
    }
    if (target.type === "SECTOR_NUMERADO") {
      if (lodEnabled && (viewMode === "macro" || target.zone.id !== focusedZoneId)) {
        enterLodZone(target.zone)
        return
      }
      vibrateTap()
      markActivity()
      onSelectZone?.(target.zone)
      return
    }
    const element = target.element
    const seatId = target.type === "ASIENTO_LIBRE" ? target.seatId : undefined
    if (seatId) {
      const match = plotSeats.find((seat) => seat.id === seatId)
      if (match) {
        toggleSeat(match)
        return
      }
    }
    toggleFreePlace(element, seatId)
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
    if (resolveEffectiveSeatingType(zone, map) === "GENERAL") {
      vibrateTap()
      markActivity()
      selectGeneralZone(zone)
      return
    }
    vibrateTap()
    markActivity()
    if (focusedZoneId !== zone.id) setRevealedZoneId(null)
    zoomToZone(zone)
    setFocusedZoneId(zone.id)
    setViewMode("micro")
    const hasMicro =
      publicRevealElements(map.elements, zone).length > 0 ||
      publicRevealSeats(plotSeats, zone).length > 0
    if (!hasMicro) onSelectZone?.(zone)
  }

  function exitLodView() {
    markActivity()
    setViewMode("macro")
    setFocusedZoneId(null)
    setRevealedZoneId(null)
    if (buyerChrome) {
      applyBuyerContentFit(true)
    } else {
      transformRef.current?.resetTransform(400, "easeOut")
    }
  }

  function handleZoneClick(zoneId: string, event?: React.SyntheticEvent) {
    event?.stopPropagation()
    const zone = lodZones.find((item) => item.id === zoneId)
    if (!zone) return
    handleMapTargetClick(mapClickTargetFromZone(zone, map))
  }

  function toggleSeat(seat: FlattenedVenueSeat) {
    if (readOnly) return
    const price = seatPrice(seat.sectorId, seat.price)
    const live = resolveLiveVenueSeatStatus({
      mapStatus: seat.mapStatus,
      occupancy: lookupOccupancyStatus(occupancy, seat.id),
      selected: selectionIdsRef.current.has(seat.id),
      held: heldSet.has(seat.id),
    })
    if (live === "blocked" || live === "occupied") return
    if (live === "held") {
      toast.info(SEAT_HELD_BY_OTHER_MESSAGE)
      return
    }

    const tableElement = (map.elements ?? []).find(
      (element) =>
        isTablePurchaseSku(element) &&
        element.sellMode !== "per_seat" &&
        (element.id === seat.sectorId ||
          element.seats.some((entry) => entry.id === seat.id)),
    )
    if (tableElement && !onPickSeat) {
      const item = storefrontItemFromElement(tableElement, priceBySectorId, map)
      if (item) {
        vibrateTap()
        markActivity()
        applyToggle(item)
        return
      }
    }

    const parentElement = (map.elements ?? []).find(
      (element) =>
        element.id === seat.sectorId ||
        element.seats.some((entry) => entry.id === seat.id),
    )
    const holdSectorId = parentElement
      ? storefrontHoldSectorId(parentElement, map)
      : seat.sectorId

    vibrateTap()
    markActivity()
    if (onPickSeat) {
      onPickSeat({
        id: seat.id,
        row: seat.row,
        number: seat.number,
        sectorId: holdSectorId,
        sectorName: seat.sectorName,
        price,
        color: seat.color,
      })
      return
    }
    const seatLabel =
      seat.label?.trim() ||
      cartPlaceLabel({
        type: "seat",
        row: seat.row,
        number: seat.number,
      }) ||
      canvasSeatLabel({
        id: seat.id,
        name: seat.sectorName,
        type: "seat",
        price,
        capacity: 1,
        sectorName: seat.sectorName,
        row: seat.row,
        number: seat.number,
      })
    armSelectionQuiet()
    const result = toggleLayoutSeat(
      {
        id: seat.id,
        row: seat.row,
        number: seat.number,
        sectorId: holdSectorId,
        sectorName: seat.sectorName,
        price,
        color: seat.color,
        label: seatLabel,
        eventDateId:
          asHoldEventDateId(
            useCheckoutStore.getState().selectedScheduleId,
          ) ?? undefined,
      },
      maxSelectable,
    )
    if (!result.ok) {
      toast.error(storefrontLimitMessage(result.reason))
      return
    }
    syncSelectionPaint()
  }

  function toggleFreePlace(element: VenueMapElement, seatId?: string) {
    const live = (map.elements ?? []).find((item) => item.id === element.id)
    if (!live || isInfrastructureElement(live)) return
    if (onPickElement) {
      const pickIds = seatId
        ? [seatId]
        : [live.id, ...live.seats.map((seat) => seat.id).filter(Boolean)]
      let heldByOther = false
      for (const id of pickIds) {
        const pickLive = resolveLiveVenueSeatStatus({
          mapStatus: "available",
          occupancy: lookupOccupancyStatus(occupancy, id, live.id),
          selected: selectionIdsRef.current.has(id),
          held: heldSet.has(id),
        })
        if (pickLive === "blocked" || pickLive === "occupied") return
        if (pickLive === "held") heldByOther = true
      }
      if (heldByOther) {
        toast.info(SEAT_HELD_BY_OTHER_MESSAGE)
        return
      }
      vibrateTap()
      markActivity()
      onPickElement(live)
      return
    }
    if (live.sellMode === "per_seat" && seatId) {
      const seatLive = resolveLiveVenueSeatStatus({
        mapStatus:
          live.seats.find((entry) => entry.id === seatId)?.status ??
          "available",
        occupancy: lookupOccupancyStatus(occupancy, seatId, live.id),
        selected: selectionIdsRef.current.has(seatId),
        held: heldSet.has(seatId),
      })
      if (seatLive === "blocked" || seatLive === "occupied") return
      if (seatLive === "held") {
        toast.info(SEAT_HELD_BY_OTHER_MESSAGE)
        return
      }
      const seat = live.seats.find((entry) => entry.id === seatId)
      const item = seat
        ? storefrontItemFromElementSeat(live, seat, priceBySectorId, map)
        : {
            id: seatId,
            name: live.label?.trim() || seatId,
            displayName: live.label?.trim() || seatId,
            type: "seat" as const,
            ticketTierId: live.ticketTypeId,
            price: resolveElementPublicPrice(live, priceBySectorId, map),
            capacity: 1,
            sectorId: storefrontHoldSectorId(live, map),
            sectorName:
              live.sectorName?.trim() || live.groupName?.trim() || undefined,
            color: live.color,
            sellMode: "per_seat" as const,
            priceMode: "per_person" as const,
            inventoryType: "SEATED_NUMERATED" as const,
            isMappedSelection: true,
          }
      if (item) {
        vibrateTap()
        markActivity()
        applyToggle(item)
        return
      }
    }
    if (live.type === "vip_chair" || seatId) {
      const match = plotSeats.find(
        (seat) =>
          seat.id === seatId ||
          seat.id === live.seats[0]?.id ||
          seat.id === live.id ||
          seat.sectorId === live.id,
      )
      if (match) {
        toggleSeat(match)
        return
      }
    }
    if (
      live.sellMode === "per_seat" &&
      live.type !== "standing_zone" &&
      live.type !== "vip_chair" &&
      !seatId
    ) {
      return
    }
    const elementLive = resolveLiveVenueSeatStatus({
      mapStatus: "available",
      occupancy: lookupOccupancyStatus(
        occupancy,
        live.id,
        ...(live.seats?.map((seat) => seat.id) ?? []),
      ),
      selected: selectionIdsRef.current.has(live.id),
      held: heldSet.has(live.id),
    })
    if (elementLive === "blocked" || elementLive === "occupied") return
    if (elementLive === "held") {
      toast.info(SEAT_HELD_BY_OTHER_MESSAGE)
      return
    }
    const item = storefrontItemFromElement(live, priceBySectorId, map)
    if (!item) return
    vibrateTap()
    markActivity()
    if (live.type === "standing_zone") {
      armSelectionQuiet()
      const result = useStorefrontSeatStore
        .getState()
        .incrementSelectedItem(stampCanvasSelection(item), maxSelectable)
      if (!result.ok) {
        toast.error(storefrontLimitMessage(result.reason))
        return
      }
      syncSelectionPaint()
      return
    }
    applyToggle(item)
  }

  function toggleElement(element: VenueMapElement) {
    if (readOnly || pending) return
    const live = (map.elements ?? []).find((item) => item.id === element.id)
    if (!live || isInfrastructureElement(live)) return
    const target = mapClickTargetFromElement(live, map)
    if (target) {
      handleMapTargetClick(target)
      return
    }
    toggleFreePlace(live)
  }

  const showModalActionFooter = Boolean(onCloseMap) && hideChrome

  const mapArea = (
      <div
        ref={tooltipHostRef}
        className={cn(
          "relative min-h-0 min-w-0 flex-1 overflow-hidden",
          hideChrome
            ? buyerChrome
              ? "h-full w-full max-w-[100vw] bg-transparent md:w-full"
              : "h-full w-full bg-background/50 md:w-full"
            : "md:w-[70%]",
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
        key={buyerChrome ? viewportSessionKey : "studio"}
        ref={transformRef}
        minScale={MIN_ZOOM}
        maxScale={buyerChrome ? CLIENT_FIT_MAX_SCALE : MAX_ZOOM}
        initialScale={savedViewportRef.current?.scale ?? 1}
        initialPositionX={savedViewportRef.current?.positionX ?? 0}
        initialPositionY={savedViewportRef.current?.positionY ?? 0}
        centerOnInit={!buyerChrome}
        centerZoomedOut={!buyerChrome}
        limitToBounds={!hideChrome && !buyerChrome}
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
          "h-full w-full overscroll-none",
          buyerMapSurfaceClass(hideChrome, buyerChrome),
          // touch-action: none only on the canvas so pinch/pan belong to the map.
          readOnly ? "pointer-events-none touch-pan-y" : "touch-none",
        )}
      >
        <TransformComponent
          wrapperClass={
            buyerChrome
              ? "!h-full !w-full !overflow-hidden !bg-transparent"
              : hideChrome
                ? "!h-full !w-full !overflow-hidden !bg-background/50"
                : "!h-full !w-full !overflow-hidden !bg-background"
          }
          contentClass={
            buyerChrome
              ? "!h-full !w-full !bg-transparent"
              : hideChrome
                ? "!h-full !w-full !bg-background/50"
                : "!h-full !w-full !bg-background"
          }
        >
        <svg
          ref={svgRef}
          viewBox={`0 ${-VIEW_TOP_PAD} ${VIEW.width} ${VIEW.height + VIEW_TOP_PAD}`}
          className={cn(
            "h-full w-full select-none",
            buyerMapSurfaceClass(hideChrome, buyerChrome),
          )}
          onPointerMove={(event) => {
            if (event.pointerType === "touch") return
            updateHoverFromEvent(event)
          }}
          onPointerDown={(event) => {
            if (event.pointerType !== "touch") return
            touchHoverRef.current = true
            updateHoverFromEvent(event)
            if (touchHoverTimer.current != null) {
              window.clearTimeout(touchHoverTimer.current)
            }
            touchHoverTimer.current = window.setTimeout(() => {
              touchHoverRef.current = false
              touchHoverTimer.current = null
              setHoveredItem(null)
            }, 2200)
          }}
          onPointerLeave={() => {
            if (touchHoverRef.current) return
            setHoveredItem(null)
          }}
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
            className={
              buyerChrome || hideChrome ? "fill-transparent" : "fill-background"
            }
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
              selectedIds={[]}
              highlightedIds={[]}
              spotlight={false}
              unavailableIds={unavailableZoneIds}
              selectOnPointerUp={!readOnly}
              lodMode={lodEnabled ? viewMode : null}
              focusedZoneId={focusedZoneId}
              buyerOccupancy={buyerOccupancy}
              onSelect={
                readOnly ? undefined : (zone) => handleZoneClick(zone.id)
              }
            />
            {revealElements.length > 0 || revealSeats.length > 0 ? (
            <g
              key={focusedZoneId ?? "overview"}
              data-inventory-rev={inventoryRev}
              className={lodEnabled ? "venue-map-reveal" : undefined}
            >
            <VenueMapElementLayer
              elements={revealElements}
              occupancyBySeatId={occupancy}
              selectedIds={[]}
              selectedSeatIds={[]}
              highlightedIds={[]}
              spotlight={false}
              preserveOrder
              popSelected={false}
              showSeats
              zoom={zoom}
              interactive={!readOnly}
              buyerOccupancy={buyerOccupancy}
              onSeatPointerDown={(_event, element, seatId) => {
                if (element.sellMode === "group") {
                  toggleElement(element)
                  return
                }
                const target = mapClickTargetFromElement(element, map, seatId)
                if (target) {
                  handleMapTargetClick(target)
                  return
                }
                const match = plotSeats.find((seat) => seat.id === seatId)
                if (match) {
                  toggleSeat(match)
                  return
                }
                toggleFreePlace(element, seatId)
              }}
              onElementPointerDown={(_event, element) => {
                toggleElement(element)
              }}
            />
            {revealSeats.map((seat) => {
              const price = seatPrice(seat.sectorId, seat.price)
              const live = resolveLiveVenueSeatStatus({
                mapStatus: seat.mapStatus,
                occupancy: lookupOccupancyStatus(occupancy, seat.id),
                selected: false,
                held: heldSet.has(seat.id),
              })
              const label = `${seat.sectorName} · Fila ${seat.row} · ${seat.number} — ${formatCurrency(price)}`
              const heldByOther = live === "held"
              const taken = live === "occupied" || live === "blocked"
              return (
                <g
                  key={seat.id}
                  id={`venue-sel-${seat.id}`}
                  data-seat-id={seat.id}
                  data-locked={taken ? "1" : undefined}
                  className={cn(
                    !readOnly && !taken && !heldByOther && "cursor-pointer",
                    (taken || heldByOther) && "cursor-not-allowed",
                    taken && "pointer-events-none",
                  )}
                  style={{
                    opacity: taken && !buyerOccupancy ? 0.3 : heldByOther ? 0.5 : 1,
                    pointerEvents: readOnly || taken ? "none" : "auto",
                  }}
                >
                  <circle
                    cx={seat.x}
                    cy={seat.y}
                    r={hitRadius}
                    fill="transparent"
                    stroke="none"
                    data-seat-id={seat.id}
                    className={
                      taken || heldByOther
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
                    opacity={taken && !buyerOccupancy ? 0.3 : 1}
                    className="pointer-events-none transition-all duration-200 ease-in-out"
                  >
                    <TheatreSeatSymbol
                      cx={seat.x}
                      cy={seat.y}
                      width={12}
                      height={12}
                      color={posStatusColors ? "#22c55e" : seat.color}
                      selected={false}
                      occupied={taken}
                      held={heldByOther}
                      buyerOccupancy={buyerOccupancy}
                      label={String(seat.number)}
                      showLabel={zoom >= 1.35}
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
      {!silentHover && hoveredItem ? (
        <SeatTooltip item={hoveredItem} x={hoverPos.x} y={hoverPos.y} />
      ) : null}
      {buyerChrome && !readOnly ? (
        <BuyerMapZoomDock
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleResetView}
          className={zoomDockClassName}
        />
      ) : null}
      {lodEnabled && viewMode === "micro" && !readOnly ? (
        <button
          type="button"
          onClick={exitLodView}
          className={cn(
            "absolute top-4 left-4 z-40 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-zinc-800",
            lodBackClassName,
          )}
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
    if (lodEnabled && viewMode === "micro") {
      exitLodView()
      markActivity()
      return
    }
    if (!applyBuyerContentFit(true)) {
      transformRef.current?.resetTransform(280, "easeOut")
    }
    markActivity()
  }

  const shell = (
    <div
      className={cn(
        "flex w-full flex-col",
        fillParent ? "h-full min-h-0" : "flex-1 min-h-0",
        hideChrome &&
          (buyerChrome ? "relative bg-transparent" : "relative bg-background/50"),
      )}
    >
      {readOnly || hideToolbar || posWorkstation ? null : (
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
          hideChrome
            ? buyerChrome
              ? "bg-transparent"
              : "bg-background/50"
            : "bg-background",
          hideChrome
            ? "rounded-none border-0 shadow-none"
            : "relative min-h-0 w-full flex-1 overflow-hidden rounded-lg border border-border bg-muted/20",
          !hideChrome && !fillParent && "min-h-[min(70dvh,36rem)]",
        )}
      >
      {mapArea}
      {posWorkstation ? (
        <PosMapZoomDock
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
        />
      ) : null}
      {hideChrome ? null : (
        <SeatingCanvasSelectionChrome
          map={map}
          priceBySectorId={priceBySectorId}
          pending={pending}
          selectedZoneId={selectedZoneId}
          mapScheduleId={mapScheduleId}
          scheduleDayCount={scheduleDayCount}
          onContinue={onContinue}
          onBack={onBack}
          onActivity={markActivity}
        />
      )}
      </div>
      {showModalActionFooter && onCloseMap ? (
        <MapModalActionFooter onClose={onCloseMap} />
      ) : null}
    </div>
  )

  return (
    <>
      {shell}
      <SeatingCanvasIdleDialog
        open={idleOpen}
        pending={pending}
        disableIdlePrompt={disableIdlePrompt}
        mapScheduleId={mapScheduleId}
        scheduleDayCount={scheduleDayCount}
        onOpenChange={setIdleOpen}
        onActivity={markActivity}
        onContinue={onContinue}
      />
    </>
  )
}

function layoutSeatsForContinue(
  mapScheduleId: string | null,
  scheduleDayCount: number,
): InteractiveSelectedSeat[] {
  return useStorefrontSeatStore
    .getState()
    .layoutSeats.filter((seat) =>
      storefrontItemMatchesSchedule(seat, mapScheduleId, { scheduleDayCount }),
    )
    .map((seat) => ({
      id: seat.id,
      row: seat.row,
      number: seat.number,
      sectorId: seat.sectorId,
      sectorName: seat.sectorName,
      price: seat.price,
      color: seat.color,
    }))
}

function SeatingCanvasSelectionChrome({
  map,
  priceBySectorId,
  pending,
  selectedZoneId,
  mapScheduleId,
  scheduleDayCount,
  onContinue,
  onBack,
  onActivity,
}: {
  map: InteractiveVenueMap
  priceBySectorId: Record<string, number>
  pending: boolean
  selectedZoneId: string | null
  mapScheduleId: string | null
  scheduleDayCount: number
  onContinue: (seats: InteractiveSelectedSeat[]) => void
  onBack?: () => void
  onActivity: () => void
}) {
  const selectedItems = useStorefrontSeatStore((state) => state.selectedItems)
  const liveSelectedItems = useMemo(
    () =>
      hydrateStorefrontItemsFromMap(
        selectedItems.filter((item) =>
          storefrontItemMatchesSchedule(item, mapScheduleId, {
            scheduleDayCount,
          }),
        ),
        map,
        priceBySectorId,
      ),
    [map, mapScheduleId, priceBySectorId, scheduleDayCount, selectedItems],
  )
  const selectionCount = storefrontSelectionCount(liveSelectedItems)
  const subtotal = storefrontSelectionTotal(liveSelectedItems)
  const canContinue = selectionCount > 0 && !pending
  const continueLabel = pending
    ? "Reservando…"
    : selectionCount > 0
      ? `Continuar con ${selectionCount} ${selectionCount === 1 ? "lugar" : "lugares"}`
      : "Continuar"
  const focusItem = liveSelectedItems[liveSelectedItems.length - 1] ?? null
  const focusCard = focusItem ? storefrontFocusCard(focusItem, map) : null

  return (
    <>
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
                {formatCurrency(
                  resolveVenueUnitPrice(
                    [sector.id],
                    sector.price === undefined || sector.price === null
                      ? 0
                      : Number(sector.price),
                    priceBySectorId,
                  ),
                )}
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
                key={storefrontSelectionKey(item)}
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
                    useStorefrontSeatStore
                      .getState()
                      .removeSelectedItem(storefrontSelectionKey(item))
                    onActivity()
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
            onClick={() =>
              onContinue(layoutSeatsForContinue(mapScheduleId, scheduleDayCount))
            }
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
            onClick={() =>
              onContinue(layoutSeatsForContinue(mapScheduleId, scheduleDayCount))
            }
            className="h-11 shrink-0 rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground hover:bg-primary/90"
          >
            <ArrowRight className="size-4" aria-hidden="true" />
            {continueLabel}
          </Button>
        </div>
      </div>
    </>
  )
}

function SeatingCanvasIdleDialog({
  open,
  pending,
  disableIdlePrompt,
  mapScheduleId,
  scheduleDayCount,
  onOpenChange,
  onActivity,
  onContinue,
}: {
  open: boolean
  pending: boolean
  disableIdlePrompt: boolean
  mapScheduleId: string | null
  scheduleDayCount: number
  onOpenChange: (open: boolean) => void
  onActivity: () => void
  onContinue: (seats: InteractiveSelectedSeat[]) => void
}) {
  const seatCount = useStorefrontSeatStore((state) => state.layoutSeats.length)
  const canContinue = seatCount > 0 && !pending
  return (
    <Dialog
      open={open && seatCount > 0 && !disableIdlePrompt}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) onActivity()
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
              onActivity()
              onOpenChange(false)
            }}
          >
            Seguir eligiendo
          </Button>
          <Button
            type="button"
            disabled={!canContinue}
            className="h-11 bg-primary font-bold text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              onActivity()
              onOpenChange(false)
              onContinue(layoutSeatsForContinue(mapScheduleId, scheduleDayCount))
            }}
          >
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MapModalActionFooter({
  onClose,
}: {
  onClose: () => void
}) {
  const selectionCount = useStorefrontSeatStore((state) =>
    storefrontSelectionCount(state.selectedItems),
  )
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

function PosMapZoomDock({
  onZoomIn,
  onZoomOut,
  onResetView,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
}) {
  const toolClass =
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-foreground transition hover:bg-background"

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-end p-3">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Acercar"
          className={toolClass}
        >
          <Plus className="size-4" aria-hidden="true" />
          Acercar
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          aria-label="Alejar"
          className={toolClass}
        >
          <Minus className="size-4" aria-hidden="true" />
          Alejar
        </button>
        <button
          type="button"
          onClick={onResetView}
          aria-label="Recentrar plano"
          className={toolClass}
        >
          <Locate className="size-4" aria-hidden="true" />
          Recentrar plano
        </button>
      </div>
    </div>
  )
}

function ExternalMapToolbar({
  title,
  showLodBack,
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
  showClear: boolean
  onExitLod: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  onClearSelection: () => void
  onClose?: () => void
}) {
  const selectionCount = useStorefrontSeatStore((state) =>
    storefrontSelectionCount(state.selectedItems),
  )
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

