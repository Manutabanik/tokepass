"use client"

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Spline,
  Group,
  Ungroup,
  ArrowLeft,
  CircleDot,
  Copy,
  Eye,
  Info,
  Layers,
  LayoutTemplate,
  Minus,
  MousePointer,
  Palette,
  Redo,
  RotateCw,
  Save,
  Square,
  Trash2,
  Type,
  Undo,
  Wand2,
  ZoomIn,
  ZoomOut,
  Armchair,
  PenTool,
  Send,
} from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { VenueBulkEditPanel } from "@/components/admin/venue-bulk-edit-panel"
import { GridArrayDialog } from "@/components/admin/grid-array-dialog"
import { LabelOverrideDialog } from "@/components/admin/label-override-dialog"
import { VenueHeatmapPanel } from "@/components/admin/venue-heatmap-panel"
import { VenueWorkModeTabs, type VenueWorkMode } from "@/components/admin/venue-work-mode-tabs"
import { VenueAutosaveBadge } from "@/components/admin/venue-autosave-badge"
import { AutoNumberingPanel } from "@/components/admin/auto-numbering-panel"
import { BuyerViewModal } from "@/components/admin/buyer-view-modal"
import { ConcentricRingGenerator } from "@/components/admin/concentric-ring-generator"
import { VenueCanvasContextMenu } from "@/components/admin/venue-canvas-context-menu"
import { VenueComponentPalette, type PalettePlacement } from "@/components/admin/venue-component-palette"
import { VenueMapBackgroundPanel } from "@/components/admin/venue-map-background-panel"
import { VenueParametricRulesPanel } from "@/components/admin/venue-parametric-rules-panel"
import { VenueSetupGuide } from "@/components/admin/venue-setup-guide"
import { SvgTransformBox } from "@/components/admin/svg-transform-box"
import { VenueMobileFabBar } from "@/components/admin/venue-mobile-fab-bar"
import { VenueNudgePad } from "@/components/admin/venue-nudge-pad"
import { InspectorShapeSelector } from "@/components/admin/inspector-shape-selector"
import { VenuePriceModeControl } from "@/components/admin/venue-price-mode-control"
import { TheatreSeatSymbol } from "@/components/admin/venue-svg-symbols"
import { VenueStudioHud } from "@/components/admin/venue-studio-hud"
import { VenueTemplateLibrary } from "@/components/admin/venue-template-selector"
import {
  deleteOrganizerVenueTemplate,
  listOrganizerVenueTemplates,
  saveOrganizerVenueTemplate,
  type OrganizerVenueTemplate,
} from "@/app/actions/venue-templates"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useIsDesktop } from "@/hooks/use-media-query"
import { useDebouncedAutosave } from "@/hooks/use-debounced-autosave"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PriceInput } from "@/components/ui/price-input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { VenueMapBackgroundLayer } from "@/components/venue/venue-map-background-layer"
import { VenueMapElementLayer } from "@/components/venue/venue-map-element-layer"
import { VenueMapZoneLayer } from "@/components/venue/venue-map-zone-layer"
import {
  applyLabelOverride,
  applyMatrixNumbering,
} from "@/lib/seating/auto-numbering"
import {
  applyHeatmapColors,
} from "@/lib/seating/venue-heatmap"
import {
  expandElementSelection,
  groupVenueElements,
  selectionFromIds,
  selectionHasGroup,
  ungroupVenueElements,
} from "@/lib/seating/venue-grouping"
import {
  pushVenueMapPast,
  takeVenueMapRedo,
  takeVenueMapUndo,
} from "@/lib/seating/venue-map-history"
import {
  applyBulkElementCapacity,
  applyBulkElementColor,
  applyBulkElementPrice,
  selectSimilarElementIds,
} from "@/lib/seating/studio-bulk-edit"
import {
  cloneVenueElement,
  createVenueElement,
  rebuildElementSeats,
} from "@/lib/seating/venue-element-geometry"
import {
  getVenueTemplateMap,
  isBlankVenueTemplate,
  type BuiltinVenueTemplateId,
} from "@/lib/constants/venue-templates"
import {
  applyVenuePriceGroupPatch,
  matchPriceGroupFromSelection,
  type VenuePriceGroup,
} from "@/lib/seating/venue-price-groups"
import {
  aabbIntersects,
  aabbToRect,
  alignElementsWithGap,
  angleAt,
  applyMoveSnap,
  applyMoveSnapFromOrigin,
  applyRotateSnap,
  bakeLiveTransform,
  clampScale,
  clampVenueZoom,
  elementAabb,
  liveTransformToSvg,
  resizeOrigin,
  selectionBounds,
  translateElements,
  zoomTowardCursor,
  type BoundsRect,
  type LiveTransform,
  type ResizeHandle,
} from "@/lib/seating/venue-transform"
import {
  applyTwoFingerViewport,
  emptyCanvasDragAction,
  touchDistance,
  touchMidpoint,
  type PinchOrigin,
} from "@/lib/seating/venue-touch"
import {
  createVenueZone,
} from "@/lib/seating/adaptive-seating"
import {
  canvasPointToPercent,
  isCloseToFirstVertex,
  transformPercentPolygon,
  translatePercentPolygon,
  VENUE_MAP_CANVAS,
} from "@/lib/seating/venue-polygon"
import {
  rebuildSectorSeats,
  venueMapCapacity,
  venueMapHasInventory,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import { applyMapCapacityToTickets } from "@/lib/seating/venue-map-pricing"
import {
  distributeOnArc,
  generateGridArray,
} from "@/lib/seating/venue-array"
import { zoneCanvasAabb } from "@/lib/seating/venue-map-lod"
import {
  formatVenueMapSkuErrors,
  validateVenueMapSkuConsistency,
  type VenueMapSkuTicketRef,
} from "@/lib/seating/venue-map-sku-consistency"
import { cn } from "@/lib/utils"
import {
  emptyVenueMap,
  parseVenueMap,
  isInfrastructureElement,
  resolveVenuePricing,
  venuePriceModeFromSellMode,
  venueUnitPriceLabel,
  type InteractiveVenueMap,
  type VenueMapElement,
  type VenueMapPoint,
  type VenueMapSector,
  type VenueMapZone,
} from "@/types/venue-map"
import type { VenueSeatingLayout } from "@/types/venues"

type Tool = "select" | "stage" | "sector" | "aisle" | "label" | "polygon"
type Selection =
  | { kind: "stage" }
  | { kind: "sector"; id: string }
  | { kind: "label"; id: string }
  | { kind: "aisle"; id: string }
  | { kind: "element"; id: string }
  | { kind: "elements"; ids: string[] }
  | { kind: "seats"; ids: string[] }
  | { kind: "zone"; id: string }
  | null

type PointerSample = {
  clientX: number
  clientY: number
  shiftKey: boolean
}

type TransformDrag =
  | {
      mode: "move"
      ids: string[]
      zoneId?: string
      startX: number
      startY: number
      originX: number
      originY: number
    }
  | {
      mode: "scale"
      ids: string[]
      zoneId?: string
      ox: number
      oy: number
      startDist: number
      handle: ResizeHandle
    }
  | {
      mode: "rotate"
      ids: string[]
      zoneId?: string
      cx: number
      cy: number
      startAngle: number
    }

type ContextTarget =
  | { kind: "stage" }
  | { kind: "sector"; id: string }
  | { kind: "label"; id: string }
  | { kind: "aisle"; id: string }
  | { kind: "element"; id: string }
  | { kind: "zone"; id: string }

const CANVAS = VENUE_MAP_CANVAS
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
  onAutoSave,
  onClose,
  onPreview,
  saving = false,
  variant = "card",
  eventTitle = "Mapa del recinto",
  tickets,
}: {
  value?: InteractiveVenueMap | null
  onChange: (map: InteractiveVenueMap, seatingLayout: VenueSeatingLayout) => void
  onSave?: (map: InteractiveVenueMap) => void
  onAutoSave?: (map: InteractiveVenueMap) => void | Promise<void>
  onClose?: () => void
  onPreview?: () => void
  saving?: boolean
  variant?: "card" | "studio"
  eventTitle?: string
  tickets?: VenueMapSkuTicketRef[] | null
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [map, setMap] = useState<InteractiveVenueMap>(
    parseVenueMap(value ?? emptyVenueMap()),
  )
  const [tool, setTool] = useState<Tool>("select")
  const [placement, setPlacement] = useState<PalettePlacement | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [polygonDraft, setPolygonDraft] = useState<VenueMapPoint[]>([])
  const [polygonCursor, setPolygonCursor] = useState<VenueMapPoint | null>(null)
  const [rulesFocusId, setRulesFocusId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [preview, setPreview] = useState(false)
  const [showRings, setShowRings] = useState(false)
  const [workMode, setWorkMode] = useState<VenueWorkMode>("architecture")
  const [gridArrayOpen, setGridArrayOpen] = useState(false)
  const [gridArrayOrigin, setGridArrayOrigin] = useState<{
    x: number
    y: number
  } | null>(null)
  const [labelOverride, setLabelOverride] = useState<{
    id: string
    value: string
  } | null>(null)
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
  const workModeRef = useRef(workMode)
  workModeRef.current = workMode
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const undoStack = useRef<InteractiveVenueMap[]>([])
  const redoStack = useRef<InteractiveVenueMap[]>([])
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  const [libraryOpen, setLibraryOpen] = useState(
    () => !venueMapHasInventory(parseVenueMap(value ?? emptyVenueMap())),
  )
  const [toolsOpen, setToolsOpen] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [modesOpen, setModesOpen] = useState(false)
  const [lassoMode, setLassoMode] = useState(false)
  const isDesktop = useIsDesktop()
  const compactChrome = !isDesktop
  const autosaveStatus = useDebouncedAutosave({
    value: map,
    delayMs: 3000,
    onSave: onAutoSave,
  })
  useEffect(() => {
    mapRef.current = map
  }, [map])
  const [customTemplates, setCustomTemplates] = useState<OrganizerVenueTemplate[]>(
    [],
  )
  const [saveOpen, setSaveOpen] = useState(false)
  const [templateName, setTemplateName] = useState(eventTitle)
  const [pendingTemplates, startTemplates] = useTransition()
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    target: ContextTarget
  } | null>(null)
  const propertiesRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const selectedVisualRef = useRef<SVGGElement>(null)
  const [measuredBounds, setMeasuredBounds] = useState<BoundsRect | null>(null)
  const spaceHeld = useRef(false)
  const shiftHeld = useRef(false)
  const [spacePan, setSpacePan] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const pendingPointer = useRef<PointerSample | null>(null)
  const pointerFrame = useRef<number | null>(null)
  const marqueeAdditive = useRef(false)
  const marqueeRef = useRef(marquee)
  const elementDrag = useRef<{
    kind: "stage" | "label" | "aisle" | "sector" | "element" | "pan"
    id?: string
    startX: number
    startY: number
    origX: number
    origY: number
    recorded?: boolean
  } | null>(null)
  const transformDrag = useRef<TransformDrag | null>(null)
  const liveGroupRef = useRef<SVGGElement>(null)
  const liveTransformRef = useRef<LiveTransform | null>(null)
  const [transformingKind, setTransformingKind] = useState<
    "move" | "scale" | "rotate" | null
  >(null)
  const [scaleHandle, setScaleHandle] = useState<ResizeHandle | null>(null)
  const compactChromeRef = useRef(compactChrome)
  compactChromeRef.current = compactChrome
  const lassoModeRef = useRef(lassoMode)
  lassoModeRef.current = lassoMode
  const pinchRef = useRef<PinchOrigin | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())

  useEffect(() => {
    if (!value) return
    const next = parseVenueMap(value)
    if (JSON.stringify(next) === JSON.stringify(mapRef.current)) return
    setMap(next)
    mapRef.current = next
  }, [value])

  useEffect(() => {
    if (!isDesktop) return
    setLassoMode(false)
    setToolsOpen(false)
    setPropertiesOpen(false)
    setModesOpen(false)
  }, [isDesktop])

  useEffect(() => {
    if (workMode !== "architecture" || selection || !propertiesOpen) return
    setPropertiesOpen(false)
  }, [workMode, selection, propertiesOpen])

  useEffect(() => {
    if (variant !== "studio") return
    startTemplates(() => {
      void listOrganizerVenueTemplates().then((result) => {
        if (result.success) setCustomTemplates(result.data)
      })
    })
  }, [variant])

  function refreshTemplates() {
    startTemplates(() => {
      void listOrganizerVenueTemplates().then((result) => {
        if (result.success) setCustomTemplates(result.data)
      })
    })
  }

  function handleClearMap() {
    const confirmed = window.confirm(
      "¿Estás seguro de que deseas borrar todo el mapa? Esta acción no se puede deshacer.",
    )
    if (!confirmed) return
    const cleared: InteractiveVenueMap = {
      ...emptyVenueMap(),
      stage: null,
      elements: [],
      zones: [],
      sectors: [],
      labels: [],
      aisles: [],
      backgroundImage: null,
      backgroundOpacity: 0.4,
      backgroundScale: 1,
      backgroundX: 0,
      backgroundY: 0,
    }
    undoStack.current = []
    redoStack.current = []
    setUndoCount(0)
    setRedoCount(0)
    mapRef.current = cleared
    setMap(cleared)
    onChange(cleared, venueMapToSeatingLayout(cleared))
    setSelection(null)
    setPolygonDraft([])
    setPolygonCursor(null)
    setPlacement(null)
    marqueeRef.current = null
    setMarquee(null)
    paintLive(null)
    setTransformingKind(null)
    setMeasuredBounds(null)
  }

  function loadMap(next: InteractiveVenueMap, showPrices: boolean) {
    const parsed = parseVenueMap(next)
    undoStack.current = []
    redoStack.current = []
    setUndoCount(0)
    setRedoCount(0)
    mapRef.current = parsed
    setMap(parsed)
    onChange(parsed, venueMapToSeatingLayout(parsed))
    setLibraryOpen(false)
    setWorkMode(showPrices ? "pricing" : "architecture")
  }

  function pickBuiltin(id: BuiltinVenueTemplateId) {
    loadMap(getVenueTemplateMap(id), !isBlankVenueTemplate(id))
  }

  const selectedSector =
    selection?.kind === "sector"
      ? map.sectors.find((sector) => sector.id === selection.id) ?? null
      : null
  const selectedZone =
    selection?.kind === "zone"
      ? (map.zones ?? []).find((zone) => zone.id === selection.id) ?? null
      : null
  const selectedElement =
    selection?.kind === "element"
      ? (map.elements ?? []).find((item) => item.id === selection.id) ?? null
      : null
  const selectedElementIds = useMemo(
    () =>
      selection?.kind === "elements"
        ? selection.ids
        : selection?.kind === "element"
          ? [selection.id]
          : [],
    [selection],
  )
  const selectedElements = useMemo(() => {
    const ids = new Set(selectedElementIds)
    return (map.elements ?? []).filter((item) => ids.has(item.id))
  }, [map.elements, selectedElementIds])
  const selectedIdSet = useMemo(
    () => new Set(selectedElementIds),
    [selectedElementIds],
  )
  const computedBounds =
    !preview && tool === "select" && !placement && selectedElements.length > 0
      ? selectionBounds(selectedElements)
      : null
  const selectedZoneBounds =
    !preview && tool === "select" && !placement && selectedZone
      ? (() => {
          const box = zoneCanvasAabb(selectedZone)
          return box ? aabbToRect(box) : null
        })()
      : null
  const transformBounds = selectedZoneBounds ?? measuredBounds ?? computedBounds
  const geometryLocked = workMode === "pricing"
  const renderMap = workMode === "pricing" ? applyHeatmapColors(map) : map
  const activePriceGroup = matchPriceGroupFromSelection(map, {
    sectorId: selectedSector?.id ?? null,
    zoneId: selectedZone?.id ?? null,
    elementIds: selectedElementIds,
  })

  useLayoutEffect(() => {
    if (
      preview ||
      tool !== "select" ||
      placement ||
      selectedElementIds.length === 0 ||
      selection?.kind === "zone"
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- getBBox is only valid after the SVG commits
      setMeasuredBounds((current) => (current ? null : current))
      return
    }
    const fallback = selectionBounds(selectedElements)
    const node = selectedVisualRef.current
    let next = fallback
    if (node) {
      try {
        const box = node.getBBox()
        if (
          Number.isFinite(box.x) &&
          Number.isFinite(box.y) &&
          Number.isFinite(box.width) &&
          Number.isFinite(box.height) &&
          box.width >= 0.5 &&
          box.height >= 0.5
        ) {
          next = {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          }
        }
      } catch {
        next = fallback
      }
    }
    setMeasuredBounds((current) => {
      if (!next) return current ? null : current
      const rounded = {
        x: Math.round(next.x * 10) / 10,
        y: Math.round(next.y * 10) / 10,
        width: Math.round(next.width * 10) / 10,
        height: Math.round(next.height * 10) / 10,
      }
      if (
        current &&
        Math.abs(current.x - rounded.x) < 0.5 &&
        Math.abs(current.y - rounded.y) < 0.5 &&
        Math.abs(current.width - rounded.width) < 0.5 &&
        Math.abs(current.height - rounded.height) < 0.5
      ) {
        return current
      }
      return rounded
    })
  }, [
    map.elements,
    placement,
    preview,
    selectedElementIds,
    selectedElements,
    selection?.kind,
    tool,
    zoom,
  ])

  useLayoutEffect(() => {
    const node = liveGroupRef.current
    if (!node) return
    const svg = liveTransformToSvg(liveTransformRef.current)
    if (svg) node.setAttribute("transform", svg)
    else node.removeAttribute("transform")
  })

  function paintLive(next: LiveTransform | null) {
    liveTransformRef.current = next
    const node = liveGroupRef.current
    if (!node) return
    const svg = liveTransformToSvg(next)
    if (svg) node.setAttribute("transform", svg)
    else node.removeAttribute("transform")
  }

  function capturePointer(event: React.PointerEvent) {
    svgRef.current?.setPointerCapture(event.pointerId)
  }

  function isIdentityLive(live: LiveTransform) {
    if (live.type === "move") {
      return Math.abs(live.dx) < 0.05 && Math.abs(live.dy) < 0.05
    }
    if (live.type === "scale") return Math.abs(live.scale - 1) < 0.001
    return Math.abs(live.deg) < 0.05
  }

  function clearLiveUi() {
    paintLive(null)
    transformDrag.current = null
    setTransformingKind(null)
    setScaleHandle(null)
  }

  function snapActive(shiftKey: boolean) {
    return shiftKey || shiftHeld.current
  }

  function commitLiveTransform(snap = false) {
    const live = liveTransformRef.current
    const drag = transformDrag.current
    if (!live || !drag || isIdentityLive(live)) {
      clearLiveUi()
      return
    }
    const snapped =
      live.type === "move" && drag.mode === "move"
        ? {
            ...live,
            ...applyMoveSnapFromOrigin(
              live.dx,
              live.dy,
              { x: drag.originX, y: drag.originY },
              snap,
            ),
          }
        : live.type === "rotate"
          ? { ...live, deg: applyRotateSnap(live.deg, snap) }
          : live
    if (isIdentityLive(snapped)) {
      clearLiveUi()
      return
    }
    const current = mapRef.current
    if (drag.zoneId) {
      paintLive(null)
      commit({
        ...current,
        zones: ensureZones(current).map((zone) =>
          zone.id === drag.zoneId
            ? { ...zone, polygon: transformPercentPolygon(zone.polygon, snapped) }
            : zone,
        ),
      })
      clearLiveUi()
      return
    }
    const selected = new Set(drag.ids)
    const baked = bakeLiveTransform(
      ensureElements(current).filter((item) => selected.has(item.id)),
      snapped,
    )
    const byId = new Map(baked.map((item) => [item.id, item]))
    paintLive(null)
    commit({
      ...current,
      elements: ensureElements(current).map((item) => byId.get(item.id) ?? item),
    })
    clearLiveUi()
  }

  function cancelLiveTransform() {
    clearLiveUi()
  }

  function beginGroupMove(
    ids: string[],
    event: React.PointerEvent,
    zoneId?: string,
  ) {
    const point = pointerToSvg(event)
    capturePointer(event)
    transformDrag.current = {
      mode: "move",
      ids,
      zoneId,
      startX: point.x,
      startY: point.y,
      originX: transformBounds?.x ?? point.x,
      originY: transformBounds?.y ?? point.y,
    }
    paintLive({ type: "move", dx: 0, dy: 0 })
    setTransformingKind("move")
  }

  function beginScale(
    handle: ResizeHandle,
    bounds: BoundsRect,
    event: React.PointerEvent,
  ) {
    const point = pointerToSvg(event)
    const origin = resizeOrigin(bounds, handle)
    const startDist = Math.hypot(point.x - origin.x, point.y - origin.y)
    capturePointer(event)
    const zoneId =
      selectionRef.current?.kind === "zone" ? selectionRef.current.id : undefined
    transformDrag.current = {
      mode: "scale",
      ids: selectedElementIds,
      zoneId,
      ox: origin.x,
      oy: origin.y,
      startDist: Math.max(startDist, 4),
      handle,
    }
    paintLive({ type: "scale", ox: origin.x, oy: origin.y, scale: 1 })
    setScaleHandle(handle)
    setTransformingKind("scale")
  }

  function beginRotate(bounds: BoundsRect, event: React.PointerEvent) {
    const point = pointerToSvg(event)
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2
    capturePointer(event)
    const zoneId =
      selectionRef.current?.kind === "zone" ? selectionRef.current.id : undefined
    transformDrag.current = {
      mode: "rotate",
      ids: selectedElementIds,
      zoneId,
      cx,
      cy,
      startAngle: angleAt({ x: cx, y: cy }, point),
    }
    paintLive({ type: "rotate", cx, cy, deg: 0 })
    setTransformingKind("rotate")
  }

  function wantsCanvasPan(event: { button: number; altKey: boolean }) {
    return event.button === 1 || (event.button === 0 && (event.altKey || spaceHeld.current))
  }

  function applyElementIds(ids: string[]) {
    const next = selectionFromIds(ids)
    if (!next) setSelection(null)
    else if (next.kind === "element") setSelection({ kind: "element", id: next.id! })
    else setSelection({ kind: "elements", ids: next.ids! })
  }

  function groupSelection() {
    if (workModeRef.current === "pricing") return
    if (selectedElementIds.length < 2) {
      toast.error("Seleccioná al menos 2 elementos para agrupar")
      return
    }
    const current = mapRef.current
    commit({
      ...current,
      elements: groupVenueElements(
        ensureElements(current),
        selectedElementIds,
      ),
    })
  }

  function ungroupSelection() {
    if (workModeRef.current === "pricing") return
    if (selectedElementIds.length === 0) return
    const current = mapRef.current
    commit({
      ...current,
      elements: ungroupVenueElements(
        ensureElements(current),
        selectedElementIds,
      ),
    })
  }

  function setStudioWorkMode(next: VenueWorkMode) {
    if (next === workModeRef.current) return
    cancelLiveTransform()
    if (next !== "architecture") {
      if (tool === "polygon" || polygonDraft.length > 0) {
        cancelPolygonDraft()
      }
      setPlacement(null)
      setShowRings(false)
      setTool("select")
    }
    setWorkMode(next)
  }

  function onMapElementPointerDown(
    event: React.PointerEvent,
    element: VenueMapElement,
  ) {
    if (wantsCanvasPan(event)) return
    event.stopPropagation()
    if (event.button !== 0) return
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
    if (event.shiftKey) {
      applyElementIds(
        expandElementSelection(
          ensureElements(mapRef.current),
          target.id,
          selectedElementIds,
          true,
        ),
      )
      return
    }
    if (event.detail >= 2) {
      if (workModeRef.current === "pricing") return
      if (!selectedIdSet.has(target.id)) {
        setSelection({ kind: "element", id: target.id })
      }
      setLabelOverride({ id: target.id, value: target.label })
      return
    }
    const groupIds = expandElementSelection(
      ensureElements(mapRef.current),
      target.id,
      selectedElementIds,
      false,
    )
    applyElementIds(groupIds)
    if (lassoModeRef.current) return
    if (workModeRef.current !== "pricing") {
      beginGroupMove(groupIds, event)
    } else if (compactChromeRef.current) {
      setPropertiesOpen(true)
    }
  }

  function pushHistory() {
    undoStack.current = pushVenueMapPast(undoStack.current, mapRef.current)
    redoStack.current = []
    setUndoCount(undoStack.current.length)
    setRedoCount(0)
  }

  function commit(next: InteractiveVenueMap, options?: { skipHistory?: boolean }) {
    if (!options?.skipHistory) pushHistory()
    mapRef.current = next
    setMap(next)
    onChange(next, venueMapToSeatingLayout(next))
  }

  function undo() {
    const result = takeVenueMapUndo(
      undoStack.current,
      redoStack.current,
      mapRef.current,
    )
    if (!result) return
    undoStack.current = result.past
    redoStack.current = result.future
    setUndoCount(result.past.length)
    setRedoCount(result.future.length)
    commit(result.current, { skipHistory: true })
  }

  function redo() {
    const result = takeVenueMapRedo(
      undoStack.current,
      redoStack.current,
      mapRef.current,
    )
    if (!result) return
    undoStack.current = result.past
    redoStack.current = result.future
    setUndoCount(result.past.length)
    setRedoCount(result.future.length)
    commit(result.current, { skipHistory: true })
  }

  function pointerToSvg(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const mapped = point.matrixTransform(ctm.inverse())
    const z = zoomRef.current
    const p = panRef.current
    return {
      x: (mapped.x - p.x) / z,
      y: (mapped.y - p.y) / z,
    }
  }

  function clientToViewBox(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return { x: CANVAS.width / 2, y: CANVAS.height / 2 }
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: CANVAS.width / 2, y: CANVAS.height / 2 }
    const mapped = point.matrixTransform(ctm.inverse())
    return { x: mapped.x, y: mapped.y }
  }

  function beginCanvasPan(event: React.PointerEvent) {
    event.preventDefault()
    capturePointer(event)
    elementDrag.current = {
      kind: "pan",
      startX: event.clientX,
      startY: event.clientY,
      origX: panRef.current.x,
      origY: panRef.current.y,
    }
    setIsPanning(true)
  }

  function applyViewport(next: { pan: { x: number; y: number }; zoom: number }) {
    panRef.current = next.pan
    zoomRef.current = next.zoom
    setPan(next.pan)
    setZoom(next.zoom)
  }

  function abortTransientGestures() {
    cancelLiveTransform()
    drag.current = null
    marqueeRef.current = null
    setMarquee(null)
    elementDrag.current = null
    setIsPanning(false)
  }

  function snapshotPinch() {
    const points = [...pointersRef.current.values()]
    if (points.length < 2) return
    const a = points[0]!
    const b = points[1]!
    const mid = touchMidpoint(a, b)
    pinchRef.current = {
      originDistance: touchDistance(a, b),
      originZoom: zoomRef.current,
      originPan: { ...panRef.current },
      originCursor: clientToViewBox(mid.x, mid.y),
    }
    setIsPanning(true)
  }

  function updatePinch() {
    const origin = pinchRef.current
    if (!origin) return
    const points = [...pointersRef.current.values()]
    if (points.length < 2) return
    const a = points[0]!
    const b = points[1]!
    const mid = touchMidpoint(a, b)
    applyViewport(
      applyTwoFingerViewport({
        origin,
        currentDistance: touchDistance(a, b),
        currentCursor: clientToViewBox(mid.x, mid.y),
      }),
    )
  }

  function onCanvasPointerDownCapture(event: React.PointerEvent) {
    if (event.button === 2) return
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    if (pointersRef.current.size >= 2) {
      event.preventDefault()
      event.stopPropagation()
      abortTransientGestures()
      snapshotPinch()
    }
  }

  function onCanvasPointerMoveCapture(event: React.PointerEvent) {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    if (pointersRef.current.size < 2 && !pinchRef.current) return
    event.preventDefault()
    event.stopPropagation()
    if (pointersRef.current.size >= 2) {
      if (!pinchRef.current) {
        abortTransientGestures()
        snapshotPinch()
      }
      updatePinch()
    }
  }

  function onCanvasPointerUpCapture(event: React.PointerEvent) {
    const wasPinching = Boolean(pinchRef.current)
    pointersRef.current.delete(event.pointerId)
    if (!wasPinching) return
    event.preventDefault()
    event.stopPropagation()
    if (pointersRef.current.size >= 2) {
      snapshotPinch()
      return
    }
    pinchRef.current = null
    setIsPanning(false)
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

  function patchSector(id: string, patch: Partial<VenueMapSector>, skipHistory = false) {
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
    }, { skipHistory })
  }

  function ensureZones(current: InteractiveVenueMap): VenueMapZone[] {
    return current.zones ?? []
  }

  function patchZone(id: string, patch: Partial<VenueMapZone>, skipHistory = false) {
    const current = mapRef.current
    commit({
      ...current,
      zones: ensureZones(current).map((zone) => {
        if (zone.id !== id) return zone
        const next = { ...zone, ...patch }
        if (next.layoutType === "numbered_seat") {
          next.sellMode = "per_seat"
          next.priceMode = "per_person"
        } else if (patch.priceMode != null || patch.sellMode != null) {
          const synced = resolveVenuePricing({
            sellMode: patch.sellMode ?? next.sellMode,
            priceMode: patch.priceMode,
            fallback: next.layoutType === "table_combo" ? "group" : next.sellMode,
          })
          next.sellMode = synced.sellMode
          next.priceMode = synced.priceMode
        } else if (patch.layoutType === "table_combo") {
          next.sellMode = "group"
          next.priceMode = "closed_unit"
        } else {
          next.priceMode =
            next.priceMode ?? venuePriceModeFromSellMode(next.sellMode)
        }
        if (next.layoutType === "general") return next
        const rows = Math.min(80, Math.max(1, Math.floor(next.rows) || 1))
        const itemsPerRow = Math.min(80, Math.max(1, Math.floor(next.itemsPerRow) || 1))
        const perUnit =
          next.layoutType === "numbered_seat"
            ? 1
            : Math.min(100, Math.max(1, Math.floor(next.capacityPerUnit) || 1))
        return {
          ...next,
          rows,
          itemsPerRow,
          capacityPerUnit: perUnit,
          capacity:
            next.layoutType === "numbered_seat" ? rows * itemsPerRow : rows * itemsPerRow * perUnit,
        }
      }),
    }, { skipHistory })
  }

  function closePolygonDraft() {
    if (polygonDraft.length < 3) {
      toast.error("Trazá al menos 3 puntos para cerrar la zona.")
      return
    }
    const current = mapRef.current
    const created = createVenueZone(
      ensureZones(current).length,
      polygonDraft.map(canvasPointToPercent),
    )
    commit({ ...current, zones: [...ensureZones(current), created] })
    setPolygonDraft([])
    setPolygonCursor(null)
    setSelection({ kind: "zone", id: created.id })
    setRulesFocusId(created.id)
    setTool("select")
    setPlacement(null)
    window.setTimeout(() => {
      propertiesRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }, 40)
  }

  function cancelPolygonDraft() {
    setPolygonDraft([])
    setPolygonCursor(null)
    setTool("select")
    setPlacement(null)
  }

  function ensureElements(current: InteractiveVenueMap): VenueMapElement[] {
    return current.elements ?? []
  }

  function placeAt(point: { x: number; y: number }, nextPlacement = placement) {
    if (workModeRef.current !== "architecture") return
    if (!nextPlacement) return
    if (nextPlacement.kind === "zone_polygon") {
      setTool("polygon")
      setPlacement(nextPlacement)
      return
    }
    const current = mapRef.current
    if (nextPlacement.kind === "seat_block") {
      addSector()
      setPlacement(null)
      return
    }
    if (nextPlacement.kind === "grid_array") {
      setGridArrayOrigin(point)
      setGridArrayOpen(true)
      setPlacement(null)
      return
    }
    if (nextPlacement.kind === "rings") {
      setShowRings(true)
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

  function patchElement(
    id: string,
    patch: Partial<VenueMapElement>,
    skipHistory = false,
  ) {
    const current = mapRef.current
    commit({
      ...current,
      elements: ensureElements(current).map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        if (patch.priceMode != null || patch.sellMode != null) {
          const synced = resolveVenuePricing({
            sellMode: patch.sellMode ?? next.sellMode,
            priceMode: patch.priceMode,
            fallback: next.sellMode,
          })
          next.sellMode = synced.sellMode
          next.priceMode = synced.priceMode
        } else if (!next.priceMode) {
          next.priceMode = venuePriceModeFromSellMode(next.sellMode)
        }
        if (
          !isInfrastructureElement(next) &&
          (
          patch.x != null ||
          patch.y != null ||
          patch.rotation != null ||
          patch.chairCount != null ||
          patch.sideA != null ||
          patch.sideB != null ||
          patch.width != null ||
          patch.height != null ||
          patch.type != null
        )
        ) {
          next.seats = rebuildElementSeats(next)
        }
        return next
      }),
    }, { skipHistory })
  }

  function duplicateSelection() {
    if (workModeRef.current === "pricing") return
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

  function duplicateTarget(target: ContextTarget | Selection) {
    if (!target) return
    const current = mapRef.current
    if (target.kind === "element") {
      const item = ensureElements(current).find((entry) => entry.id === target.id)
      if (!item) return
      const clone = cloneVenueElement(item, 15)
      commit({ ...current, elements: [...ensureElements(current), clone] })
      setSelection({ kind: "element", id: clone.id })
      return
    }
    if (target.kind === "elements") {
      const clones = ensureElements(current)
        .filter((item) => target.ids.includes(item.id))
        .map((item) => cloneVenueElement(item, 15))
      if (clones.length === 0) return
      commit({ ...current, elements: [...ensureElements(current), ...clones] })
      setSelection(
        clones.length === 1
          ? { kind: "element", id: clones[0]!.id }
          : { kind: "elements", ids: clones.map((item) => item.id) },
      )
      return
    }
    if (target.kind === "sector") {
      const sector = current.sectors.find((item) => item.id === target.id)
      if (!sector) return
      const copy: VenueMapSector = {
        ...sector,
        id: newId("sector"),
        x: sector.x + 15,
        y: sector.y + 15,
        seats: [],
      }
      copy.seats = rebuildSectorSeats(copy)
      commit({ ...current, sectors: [...current.sectors, copy] })
      setSelection({ kind: "sector", id: copy.id })
      return
    }
    if (target.kind === "label") {
      const label = current.labels.find((item) => item.id === target.id)
      if (!label) return
      const copy = { ...label, id: newId("label"), x: label.x + 15, y: label.y + 15 }
      commit({ ...current, labels: [...current.labels, copy] })
      setSelection({ kind: "label", id: copy.id })
      return
    }
    if (target.kind === "aisle") {
      const aisle = current.aisles.find((item) => item.id === target.id)
      if (!aisle) return
      const copy = { ...aisle, id: newId("aisle"), x: aisle.x + 15, y: aisle.y + 15 }
      commit({ ...current, aisles: [...current.aisles, copy] })
      setSelection({ kind: "aisle", id: copy.id })
      return
    }
    if (target.kind === "zone") {
      const zone = ensureZones(current).find((item) => item.id === target.id)
      if (!zone) return
      const copy: VenueMapZone = {
        ...zone,
        id: newId("zone"),
        name: `${zone.name} copia`,
        polygon: translatePercentPolygon(zone.polygon, 12, 12),
      }
      commit({ ...current, zones: [...ensureZones(current), copy] })
      setSelection({ kind: "zone", id: copy.id })
    }
  }

  function rotateSelection(delta = 90, ids = selectedElementIds) {
    if (workModeRef.current === "pricing") return
    if (ids.length === 0) return
    const chosen = new Set(ids)
    const current = mapRef.current
    commit({
      ...current,
      elements: ensureElements(current).map((item) => {
        if (!chosen.has(item.id)) return item
        const next = { ...item, rotation: (item.rotation + delta) % 360 }
        if (!isInfrastructureElement(next)) {
          next.seats = rebuildElementSeats(next)
        }
        return next
      }),
    })
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

  function selectSimilarByColor() {
    const sourceId = selectedElement?.id
    if (!sourceId) return
    const ids = selectSimilarElementIds(ensureElements(mapRef.current), sourceId)
    if (ids.length === 0) return
    if (ids.length === 1) {
      setSelection({ kind: "element", id: ids[0]! })
      return
    }
    setSelection({ kind: "elements", ids })
  }

  function batchPrice(price: number) {
    const current = mapRef.current
    commit({
      ...current,
      elements: applyBulkElementPrice(
        ensureElements(current),
        selectedElementIds,
        price,
      ),
    })
  }

  function batchColor(color: string) {
    const current = mapRef.current
    commit({
      ...current,
      elements: applyBulkElementColor(
        ensureElements(current),
        selectedElementIds,
        color,
      ),
    })
  }

  function batchCapacity(capacity: number) {
    const current = mapRef.current
    commit({
      ...current,
      elements: applyBulkElementCapacity(
        ensureElements(current),
        selectedElementIds,
        capacity,
      ),
    })
  }

  function applySelectedElements(next: VenueMapElement[]) {
    const current = mapRef.current
    commit({ ...current, elements: next })
  }

  function selectPriceGroup(group: VenuePriceGroup) {
    const match = group.match
    if (match.kind === "sector") {
      setSelection({ kind: "sector", id: match.id })
      return
    }
    if (match.kind === "zone") {
      setSelection({ kind: "zone", id: match.id })
      return
    }
    if (match.kind === "group") {
      const groupedId = match.groupId
      const ids = ensureElements(mapRef.current)
        .filter((item) => item.groupId === groupedId)
        .map((item) => item.id)
      applyElementIds(ids)
      return
    }
    applyElementIds(match.ids)
  }

  function patchPriceGroup(
    group: VenuePriceGroup,
    patch: { price?: number; color?: string },
  ) {
    commit(applyVenuePriceGroupPatch(mapRef.current, group, patch))
  }

  function applyGridBlock(values: {
    type: "vip_chair" | "round_table" | "long_table"
    rows: number
    columns: number
    gap: number
    groupName: string
  }) {
    const current = mapRef.current
    const created = generateGridArray({
      ...values,
      origin: gridArrayOrigin ?? undefined,
    })
    const numbered = applyMatrixNumbering(
      created,
      created.map((item) => item.id),
      { rowAxis: "letters", aisleMode: "sequential" },
    )
    commit({
      ...current,
      elements: [...ensureElements(current), ...numbered],
    })
    setSelection({
      kind: "elements",
      ids: numbered.map((item) => item.id),
    })
    setGridArrayOpen(false)
    setGridArrayOrigin(null)
    setPlacement(null)
    setTool("select")
    toast.success(`${numbered.length} elementos generados`)
  }

  function saveLabelOverride() {
    if (!labelOverride?.value.trim()) return
    const current = mapRef.current
    commit({
      ...current,
      elements: applyLabelOverride(
        ensureElements(current),
        labelOverride.id,
        labelOverride.value,
      ),
    })
    setLabelOverride(null)
  }

  function alignSelection(
    mode: "left" | "centerX" | "right" | "top" | "centerY" | "bottom",
  ) {
    if (selectedElementIds.length < 2) return
    const current = mapRef.current
    commit({
      ...current,
      elements: alignElementsWithGap(
        ensureElements(current),
        selectedElementIds,
        mode,
      ),
    })
  }

  function alignSelectionOnCurve() {
    if (selectedElementIds.length < 2) return
    const current = mapRef.current
    const stage = current.stage
    commit({
      ...current,
      elements: distributeOnArc(
        ensureElements(current),
        selectedElementIds,
        {
          focus: stage
            ? {
                x: stage.x + stage.width / 2,
                y: stage.y + stage.height / 2,
              }
            : { x: CANVAS.width / 2, y: 24 },
        },
      ),
    })
  }

  function deleteSelection() {
    if (workModeRef.current === "pricing") return
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
    } else if (selection.kind === "zone") {
      commit({
        ...map,
        zones: ensureZones(map).filter((zone) => zone.id !== selection.id),
      })
    }
    setSelection(null)
  }

  function openObjectMenu(event: React.MouseEvent, target: ContextTarget) {
    event.preventDefault()
    event.stopPropagation()
    setSelection(target)
    setContextMenu({ x: event.clientX, y: event.clientY, target })
  }

  function focusProperties() {
    if (compactChrome) {
      setPropertiesOpen(true)
      return
    }
    propertiesRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  function nudgeSelection(dx: number, dy: number) {
    if (workModeRef.current === "pricing") return
    if (!selection) return
    const current = mapRef.current
    if (selection.kind === "stage" && current.stage) {
      commit({
        ...current,
        stage: { ...current.stage, x: current.stage.x + dx, y: current.stage.y + dy },
      })
      return
    }
    if (selection.kind === "label") {
      commit({
        ...current,
        labels: current.labels.map((label) =>
          label.id === selection.id
            ? { ...label, x: label.x + dx, y: label.y + dy }
            : label,
        ),
      })
      return
    }
    if (selection.kind === "aisle") {
      commit({
        ...current,
        aisles: current.aisles.map((aisle) =>
          aisle.id === selection.id
            ? { ...aisle, x: aisle.x + dx, y: aisle.y + dy }
            : aisle,
        ),
      })
      return
    }
    if (selection.kind === "sector") {
      commit({
        ...current,
        sectors: current.sectors.map((sector) =>
          sector.id === selection.id
            ? { ...sector, x: sector.x + dx, y: sector.y + dy }
            : sector,
        ),
      })
      return
    }
    if (selection.kind === "zone") {
      commit({
        ...current,
        zones: ensureZones(current).map((zone) =>
          zone.id === selection.id
            ? {
                ...zone,
                polygon: translatePercentPolygon(zone.polygon, dx, dy),
              }
            : zone,
        ),
      })
      return
    }
    const ids = new Set(selectedElementIds)
    if (ids.size === 0) return
    const selected = ensureElements(current).filter((item) => ids.has(item.id))
    const moved = translateElements(selected, dx, dy)
    const byId = new Map(moved.map((item) => [item.id, item]))
    commit({
      ...current,
      elements: ensureElements(current).map((item) => byId.get(item.id) ?? item),
    })
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
    if (workModeRef.current === "pricing") return
    if (lassoModeRef.current) return
    if (wantsCanvasPan(event)) return
    if (event.button !== 0) return
    capturePointer(event)
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

  function onZonePointerDown(event: React.PointerEvent, zone: VenueMapZone) {
    if (wantsCanvasPan(event)) return
    event.stopPropagation()
    if (event.button !== 0) return
    setSelection({ kind: "zone", id: zone.id })
    if (lassoModeRef.current) return
    if (workModeRef.current !== "pricing") {
      beginGroupMove([], event, zone.id)
    } else if (compactChromeRef.current) {
      setPropertiesOpen(true)
    }
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (preview) return
    if (pinchRef.current || pointersRef.current.size > 1) return
    if (wantsCanvasPan(event)) {
      beginCanvasPan(event)
      return
    }
    if (event.button !== 0) return
    const point = pointerToSvg(event)
    if (tool === "polygon") {
      event.preventDefault()
      const next = {
        x: Math.round(point.x * 10) / 10,
        y: Math.round(point.y * 10) / 10,
      }
      if (isCloseToFirstVertex(polygonDraft, next)) {
        closePolygonDraft()
        return
      }
      if (event.detail >= 2) {
        if (polygonDraft.length >= 3) closePolygonDraft()
        return
      }
      setPolygonDraft((current) => [...current, next])
      return
    }
    if (placement && workModeRef.current === "architecture" && !event.altKey && !spaceHeld.current) {
      placeAt(point)
      return
    }
    if (tool !== "select") return
    if (
      emptyCanvasDragAction({
        compactChrome: compactChromeRef.current,
        lassoMode: lassoModeRef.current,
      }) === "ignore"
    ) {
      if (!event.shiftKey) setSelection(null)
      return
    }
    capturePointer(event)
    drag.current = { x: point.x, y: point.y }
    marqueeAdditive.current = event.shiftKey
    const seed = { x: point.x, y: point.y, w: 0, h: 0 }
    marqueeRef.current = seed
    setMarquee(seed)
    if (!event.shiftKey) setSelection(null)
  }

  function applyPointerMove(sample: PointerSample) {
    if (pinchRef.current) return
    const transforming = transformDrag.current
    if (transforming) {
      const point = pointerToSvg(sample)
      if (transforming.mode === "move") {
        const snapped = applyMoveSnapFromOrigin(
          point.x - transforming.startX,
          point.y - transforming.startY,
          { x: transforming.originX, y: transforming.originY },
          snapActive(sample.shiftKey),
        )
        paintLive({ type: "move", dx: snapped.dx, dy: snapped.dy })
        return
      }
      if (transforming.mode === "scale") {
        const dist = Math.hypot(point.x - transforming.ox, point.y - transforming.oy)
        paintLive({
          type: "scale",
          ox: transforming.ox,
          oy: transforming.oy,
          scale: clampScale(dist / transforming.startDist),
        })
        return
      }
      const deg = applyRotateSnap(
        angleAt({ x: transforming.cx, y: transforming.cy }, point) -
          transforming.startAngle,
        snapActive(sample.shiftKey),
      )
      paintLive({
        type: "rotate",
        cx: transforming.cx,
        cy: transforming.cy,
        deg,
      })
      return
    }
    const moving = elementDrag.current
    if (moving?.kind === "pan") {
      const nextPan = {
        x: moving.origX + (sample.clientX - moving.startX),
        y: moving.origY + (sample.clientY - moving.startY),
      }
      panRef.current = nextPan
      setPan(nextPan)
      return
    }
    const current = mapRef.current
    if (moving) {
      if (!moving.recorded) {
        pushHistory()
        moving.recorded = true
      }
      const point = pointerToSvg(sample)
      const delta = applyMoveSnap(
        point.x - moving.startX,
        point.y - moving.startY,
        snapActive(sample.shiftKey),
      )
      const nx = Math.round(moving.origX + delta.dx)
      const ny = Math.round(moving.origY + delta.dy)
      if (moving.kind === "stage" && current.stage) {
        commit({ ...current, stage: { ...current.stage, x: nx, y: ny } }, { skipHistory: true })
      } else if (moving.kind === "label" && moving.id) {
        commit({
          ...current,
          labels: current.labels.map((label) =>
            label.id === moving.id ? { ...label, x: nx, y: ny } : label,
          ),
        }, { skipHistory: true })
      } else if (moving.kind === "aisle" && moving.id) {
        commit({
          ...current,
          aisles: current.aisles.map((aisle) =>
            aisle.id === moving.id ? { ...aisle, x: nx, y: ny } : aisle,
          ),
        }, { skipHistory: true })
      } else if (moving.kind === "sector" && moving.id) {
        patchSector(moving.id, { x: nx, y: ny }, true)
      }
      return
    }
    if (!drag.current) return
    const point = pointerToSvg(sample)
    const nextMarquee = {
      x: Math.min(drag.current.x, point.x),
      y: Math.min(drag.current.y, point.y),
      w: Math.abs(point.x - drag.current.x),
      h: Math.abs(point.y - drag.current.y),
    }
    marqueeRef.current = nextMarquee
    setMarquee(nextMarquee)
  }

  function flushPointerMove() {
    pointerFrame.current = null
    const sample = pendingPointer.current
    if (!sample) return
    applyPointerMove(sample)
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (preview) return
    if (tool === "polygon") {
      const point = pointerToSvg(event)
      setPolygonCursor({
        x: Math.round(point.x * 10) / 10,
        y: Math.round(point.y * 10) / 10,
      })
    }
    pendingPointer.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      shiftKey: event.shiftKey,
    }
    if (pointerFrame.current != null) return
    pointerFrame.current = window.requestAnimationFrame(flushPointerMove)
  }

  function finishPointerGesture(shiftKey = false) {
    if (pinchRef.current) return
    if (pointerFrame.current != null) {
      window.cancelAnimationFrame(pointerFrame.current)
      pointerFrame.current = null
    }
    if (pendingPointer.current) {
      applyPointerMove(pendingPointer.current)
      pendingPointer.current = null
    }
    if (transformDrag.current) {
      const live = liveTransformRef.current
      const wasTap = !live || isIdentityLive(live)
      commitLiveTransform(snapActive(shiftKey))
      drag.current = null
      elementDrag.current = null
      setIsPanning(false)
      marqueeRef.current = null
      setMarquee(null)
      if (wasTap && compactChromeRef.current && !lassoModeRef.current) {
        setPropertiesOpen(true)
      }
      return
    }
    const boxMarquee = marqueeRef.current
    const legacyDrag = elementDrag.current
    const legacyTap =
      Boolean(legacyDrag) &&
      legacyDrag?.kind !== "pan" &&
      !legacyDrag?.recorded
    let selectedFromMarquee = false
    if (boxMarquee && boxMarquee.w > 8 && boxMarquee.h > 8) {
      const box = {
        minX: boxMarquee.x,
        minY: boxMarquee.y,
        maxX: boxMarquee.x + boxMarquee.w,
        maxY: boxMarquee.y + boxMarquee.h,
      }
      const elementIds = ensureElements(mapRef.current)
        .filter((item) => aabbIntersects(elementAabb(item), box))
        .map((item) => item.id)
      const zoneHits = ensureZones(mapRef.current).filter((zone) => {
        const zoneBox = zoneCanvasAabb(zone)
        return zoneBox ? aabbIntersects(zoneBox, box) : false
      })
      if (elementIds.length > 0) {
        const currentSel = selectionRef.current
        const existing =
          marqueeAdditive.current &&
          (currentSel?.kind === "element" || currentSel?.kind === "elements")
            ? currentSel.kind === "elements"
              ? currentSel.ids
              : [currentSel.id]
            : []
        const merged = [...new Set([...existing, ...elementIds])]
        if (merged.length === 1) setSelection({ kind: "element", id: merged[0]! })
        else setSelection({ kind: "elements", ids: merged })
        selectedFromMarquee = true
      } else if (zoneHits.length === 1) {
        setSelection({ kind: "zone", id: zoneHits[0]!.id })
        selectedFromMarquee = true
      } else if (zoneHits.length > 1) {
        setSelection({ kind: "zone", id: zoneHits[0]!.id })
        selectedFromMarquee = true
      } else {
        const ids: string[] = []
        for (const sector of mapRef.current.sectors) {
          for (const seat of sector.seats) {
            if (
              seat.x >= boxMarquee.x &&
              seat.x <= boxMarquee.x + boxMarquee.w &&
              seat.y >= boxMarquee.y &&
              seat.y <= boxMarquee.y + boxMarquee.h
            ) {
              ids.push(seatKey(sector.id, seat.id))
            }
          }
        }
        if (ids.length > 0) {
          setSelection({ kind: "seats", ids })
          selectedFromMarquee = true
        }
      }
    }
    drag.current = null
    elementDrag.current = null
    setIsPanning(false)
    marqueeRef.current = null
    setMarquee(null)
    if (compactChromeRef.current && (legacyTap || selectedFromMarquee)) {
      setPropertiesOpen(true)
    }
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (pinchRef.current) return
    finishPointerGesture(event.shiftKey)
  }

  function onPointerLeave(event: React.PointerEvent<SVGSVGElement>) {
    if (tool === "polygon") setPolygonCursor(null)
    if (pinchRef.current) return
    if (transformDrag.current || elementDrag.current) return
    finishPointerGesture(event.shiftKey)
  }

  const selectedSeatCount = selection?.kind === "seats" ? selection.ids.length : 0
  const capacity = useMemo(() => venueMapCapacity(map), [map])
  const canUndo = undoCount > 0
  const canRedo = redoCount > 0
  const isStudio = variant === "studio"

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
    }

    function onKeyDown(event: KeyboardEvent) {
      if (preview || isTypingTarget(event.target)) return
      if (event.code === "Space") {
        event.preventDefault()
        spaceHeld.current = true
        setSpacePan(true)
        return
      }
      if (event.key === "Shift") {
        shiftHeld.current = true
        const sample = pendingPointer.current
        if (sample && transformDrag.current) {
          applyPointerMove({ ...sample, shiftKey: true })
        }
        return
      }
      if (event.key === "Escape") {
        if (tool === "polygon" || polygonDraft.length > 0) {
          event.preventDefault()
          cancelPolygonDraft()
          return
        }
        if (liveTransformRef.current || transformDrag.current) {
          event.preventDefault()
          cancelLiveTransform()
          return
        }
      }
      if (event.key === "Enter" && tool === "polygon") {
        event.preventDefault()
        closePolygonDraft()
        return
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selection) {
        event.preventDefault()
        deleteSelection()
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        nudgeSelection(0, event.shiftKey ? -16 : -8)
        return
      }
      if (event.key === "ArrowDown") {
        event.preventDefault()
        nudgeSelection(0, event.shiftKey ? 16 : 8)
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        nudgeSelection(event.shiftKey ? -16 : -8, 0)
        return
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        nudgeSelection(event.shiftKey ? 16 : 8, 0)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
        event.preventDefault()
        if (event.shiftKey) ungroupSelection()
        else groupSelection()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault()
        redo()
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        spaceHeld.current = false
        setSpacePan(false)
      }
      if (event.key === "Shift") {
        shiftHeld.current = false
        const sample = pendingPointer.current
        if (sample && transformDrag.current) {
          applyPointerMove({ ...sample, shiftKey: false })
        }
      }
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      spaceHeld.current = false
      shiftHeld.current = false
    }
  })

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      const factor = event.deltaY > 0 ? 0.92 : 1.087
      const nextZoom = clampVenueZoom(
        Number((zoomRef.current * factor).toFixed(3)),
      )
      if (nextZoom === zoomRef.current) return
      applyViewport(
        zoomTowardCursor({
          pan: panRef.current,
          zoom: zoomRef.current,
          nextZoom,
          cursor: clientToViewBox(event.clientX, event.clientY),
        }),
      )
    }
    function preventMiddleScroll(event: MouseEvent) {
      if (event.button === 1) event.preventDefault()
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("mousedown", preventMiddleScroll)
    el.addEventListener("auxclick", preventMiddleScroll)
    function preventNativeTouch(event: Event) {
      event.preventDefault()
    }
    el.addEventListener("touchmove", preventNativeTouch, { passive: false })
    el.addEventListener("gesturestart", preventNativeTouch, { passive: false })
    el.addEventListener("gesturechange", preventNativeTouch, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("mousedown", preventMiddleScroll)
      el.removeEventListener("auxclick", preventMiddleScroll)
      el.removeEventListener("touchmove", preventNativeTouch)
      el.removeEventListener("gesturestart", preventNativeTouch)
      el.removeEventListener("gesturechange", preventNativeTouch)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (pointerFrame.current != null) {
        window.cancelAnimationFrame(pointerFrame.current)
      }
    }
  }, [])

  function openPreview() {
    if (onPreview) onPreview()
    else setPreview(true)
  }

  function pickPaletteItem(next: PalettePlacement) {
    if (next.kind === "zone_polygon") {
      setPlacement(next)
      setTool("polygon")
      setPolygonDraft([])
      setToolsOpen(false)
      return
    }
    if (next.kind === "grid_array") {
      setGridArrayOrigin(null)
      setGridArrayOpen(true)
      setPlacement(null)
      setTool("select")
      setToolsOpen(false)
      return
    }
    setPlacement(next)
    setTool("select")
    setToolsOpen(false)
  }

  const hasPropertiesTarget =
    Boolean(selection) || workMode === "pricing" || workMode === "indexing"
  const mobileSheetOpen = toolsOpen || propertiesOpen || modesOpen

  const toolbar = (
    <div
      className={cn(
        "z-20 flex w-full items-center border-b border-border bg-card",
        isStudio
          ? "min-h-14 shrink-0 flex-nowrap gap-2 overflow-x-auto px-2 py-1.5 hide-scrollbar"
          : "flex-wrap gap-2 overflow-hidden px-3 py-2",
      )}
    >
      {isStudio ? (
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="h-9 shrink-0 px-2 md:px-3"
            aria-label="Salir sin guardar"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden md:inline">Salir</span>
          </Button>
          <p className="hidden max-w-[7rem] truncate text-sm font-semibold text-foreground sm:block md:max-w-[160px]">
            {eventTitle}
          </p>
        </div>
      ) : null}

      <VenueWorkModeTabs
        value={workMode}
        onChange={setStudioWorkMode}
        className={cn("min-w-0 shrink-0", compactChrome && "hidden")}
      />
      <VenueAutosaveBadge status={autosaveStatus} />

      <div
        data-slot="button-group"
        className={cn(
          "inline-flex min-w-0 items-center rounded-lg border border-border bg-muted/40 p-0.5",
          isStudio && "scrollbar-none overflow-x-auto",
          !isStudio && "flex-wrap gap-1 border-0 bg-transparent p-0",
          compactChrome && "hidden",
        )}
      >
        <ToolButton
          active={tool === "select"}
          onClick={() => {
            setTool("select")
            setPlacement(null)
          }}
          label="Select"
          showLabel={isStudio ? "md" : true}
        >
          <MousePointer className="size-4" />
        </ToolButton>
        <ToolButton
          active={tool === "polygon"}
          onClick={() => {
            setWorkMode("architecture")
            setTool("polygon")
            setPlacement({ kind: "zone_polygon" })
          }}
          label="Trazar zona"
          showLabel={isStudio ? "md" : true}
        >
          <PenTool className="size-4" />
        </ToolButton>
        <ToolButton
          active={false}
          onClick={() => {
            const rect = svgRef.current?.getBoundingClientRect()
            const cursor = rect
              ? clientToViewBox(
                  rect.left + rect.width / 2,
                  rect.top + rect.height / 2,
                )
              : { x: CANVAS.width / 2, y: CANVAS.height / 2 }
            applyViewport(
              zoomTowardCursor({
                pan: panRef.current,
                zoom: zoomRef.current,
                nextZoom: clampVenueZoom(zoomRef.current - 0.1),
                cursor,
              }),
            )
          }}
          label="Zoom -"
          showLabel={false}
        >
          <ZoomOut className="size-4" />
        </ToolButton>
        <ToolButton
          active={false}
          onClick={() => {
            const rect = svgRef.current?.getBoundingClientRect()
            const cursor = rect
              ? clientToViewBox(
                  rect.left + rect.width / 2,
                  rect.top + rect.height / 2,
                )
              : { x: CANVAS.width / 2, y: CANVAS.height / 2 }
            applyViewport(
              zoomTowardCursor({
                pan: panRef.current,
                zoom: zoomRef.current,
                nextZoom: clampVenueZoom(zoomRef.current + 0.1),
                cursor,
              }),
            )
          }}
          label="Zoom +"
          showLabel={false}
        >
          <ZoomIn className="size-4" />
        </ToolButton>
        <ToolButton
          active={false}
          onClick={undo}
          label="Deshacer"
          disabled={!canUndo}
          showLabel={false}
        >
          <Undo className="size-4" />
        </ToolButton>
        <ToolButton
          active={false}
          onClick={redo}
          label="Rehacer"
          disabled={!canRedo}
          showLabel={false}
        >
          <Redo className="size-4" />
        </ToolButton>
        {!isStudio ? (
          <>
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
            <ToolButton active={false} onClick={duplicateSelection} label="Duplicar">
              <Copy className="size-4" />
            </ToolButton>
          </>
        ) : null}
      </div>

      <div
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          isStudio
            ? "ml-auto shrink-0 flex-nowrap justify-end"
            : "ml-auto flex-wrap",
        )}
      >
        {isStudio ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 px-2 md:px-3"
              onClick={handleClearMap}
              aria-label="Limpiar mapa"
            >
              <Trash2 className="size-4 md:mr-2" />
              <span className="hidden md:inline">Limpiar Mapa</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 px-2 md:px-3"
              onClick={() => setLibraryOpen(true)}
              aria-label="Plantillas"
            >
              <LayoutTemplate className="size-4 md:mr-2" />
              <span className="hidden md:inline">Plantillas</span>
            </Button>
            <VenueSetupGuide compact />
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 px-2 md:px-3"
              disabled={pendingTemplates}
              aria-label="Guardar como mi plantilla"
              onClick={() => {
                setTemplateName(eventTitle || "Mi recinto")
                setSaveOpen(true)
              }}
            >
              <Save className="size-4 md:mr-2" />
              <span className="hidden md:inline">Mi plantilla</span>
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-9 shrink-0 px-2 md:px-3"
          onClick={openPreview}
          aria-label="Vista previa del comprador"
        >
          <Eye className="size-4 text-emerald-500 md:mr-2" />
          <span className="hidden md:inline">Vista Previa del Comprador</span>
        </Button>
        {onSave ? (
          <Button
            type="button"
            disabled={saving}
            onClick={() => {
              if (!onSave) return
              const healedTickets = applyMapCapacityToTickets(tickets ?? [], map)
              const result = validateVenueMapSkuConsistency({
                map,
                tickets: healedTickets,
              })
              if (!result.ok) {
                toast.error("No se puede guardar el mapa", {
                  description: formatVenueMapSkuErrors(result.errors),
                })
                return
              }
              onSave(map)
            }}
            className="h-9 shrink-0 bg-emerald-500 px-2 font-bold text-black hover:bg-emerald-400 md:px-3"
            aria-label="Guardar cambios"
          >
            <Save className="size-4 md:mr-2" />
            <span className="hidden md:inline">Guardar Cambios</span>
          </Button>
        ) : null}
      </div>
    </div>
  )

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-background",
        isStudio
          ? "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
          : "rounded-2xl border border-border",
      )}
    >
      {toolbar}

      <div
        className={cn(
          isStudio || compactChrome
            ? "flex min-h-0 flex-1 overflow-hidden"
            : "grid lg:grid-cols-[220px_1fr_280px]",
        )}
      >
        {workMode === "architecture" && !compactChrome ? (
          <VenueComponentPalette
            variant={isStudio ? "studio" : "compact"}
            active={placement}
            onPick={pickPaletteItem}
          />
        ) : null}
        <div
          ref={canvasRef}
          className={cn(
            "relative overflow-hidden touch-none overscroll-none select-none bg-background bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] bg-[size:20px_20px]",
            isStudio
              ? "relative h-full min-h-0 w-full flex-1"
              : "min-h-[420px] bg-zinc-950",
            spacePan && !isPanning && "cursor-grab [&_*]:cursor-grab",
            isPanning && "cursor-grabbing [&_*]:cursor-grabbing",
          )}
          style={{ touchAction: "none" }}
          onPointerDownCapture={onCanvasPointerDownCapture}
          onPointerMoveCapture={onCanvasPointerMoveCapture}
          onPointerUpCapture={onCanvasPointerUpCapture}
          onPointerCancelCapture={onCanvasPointerUpCapture}
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
                {
                  x: (mapped.x - panRef.current.x) / zoomRef.current,
                  y: (mapped.y - panRef.current.y) / zoomRef.current,
                },
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
            className={cn(
              "w-full touch-none select-none",
              isStudio ? "h-full" : "h-[min(70vh,560px)]",
              tool === "polygon" && "cursor-crosshair",
              (spacePan || isPanning) && tool !== "polygon" && "cursor-grab",
              isPanning && "cursor-grabbing",
              transformingKind === "move" && "cursor-grabbing",
              transformingKind === "rotate" && "cursor-grabbing",
              transformingKind === "scale" &&
                (scaleHandle === "ne" || scaleHandle === "sw"
                  ? "cursor-nesw-resize"
                  : "cursor-nwse-resize"),
            )}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onPointerCancel={onPointerUp}
          >
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              <rect width={CANVAS.width} height={CANVAS.height} fill="transparent" />
              <VenueMapBackgroundLayer map={renderMap} />
              <VenueMapZoneLayer
                zones={(renderMap.zones ?? []).filter(
                  (zone) => zone.id !== selectedZone?.id,
                )}
                selectedId={null}
                emphasizeSelected={false}
                draft={polygonDraft}
                cursor={tool === "polygon" ? polygonCursor : null}
                onSelect={
                  tool === "polygon"
                    ? undefined
                    : (zone) => setSelection({ kind: "zone", id: zone.id })
                }
                onPointerDown={
                  tool === "polygon" ? undefined : onZonePointerDown
                }
                onContextMenu={(event, zone) =>
                  openObjectMenu(event, { kind: "zone", id: zone.id })
                }
              />
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
                  onContextMenu={(event) => openObjectMenu(event, { kind: "aisle", id: aisle.id })}
                  onPointerDown={(event) => {
                    if (wantsCanvasPan(event)) return
                    event.stopPropagation()
                    if (event.button !== 0) return
                    setSelection({ kind: "aisle", id: aisle.id })
                    beginElementDrag("aisle", event, aisle.x, aisle.y, aisle.id)
                  }}
                />
              ))}
              {map.stage ? (
                <g
                  onContextMenu={(event) => openObjectMenu(event, { kind: "stage" })}
                  onPointerDown={(event) => {
                    if (wantsCanvasPan(event)) return
                    event.stopPropagation()
                    if (event.button !== 0) return
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
                    className={cn(
                      "fill-zinc-200 dark:fill-zinc-100",
                      selection?.kind === "stage" && "stroke-emerald-400",
                    )}
                    strokeWidth={selection?.kind === "stage" ? 2 : 0}
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
              {renderMap.sectors.map((sector) => (
                <g key={sector.id}>
                  {sector.seats.map((seat) => {
                    const key = seatKey(sector.id, seat.id)
                    const active =
                      (selection?.kind === "sector" && selection.id === sector.id) ||
                      (selection?.kind === "seats" && selection.ids.includes(key))
                    return (
                      <g
                        key={seat.id}
                        onContextMenu={(event) =>
                          openObjectMenu(event, { kind: "sector", id: sector.id })
                        }
                        onPointerDown={(event) => {
                          if (wantsCanvasPan(event)) return
                          event.stopPropagation()
                          if (event.button !== 0) return
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
                      >
                        <TheatreSeatSymbol
                          cx={seat.x}
                          cy={seat.y}
                          width={12}
                          height={12}
                          color={seat.status === "blocked" ? "#3f3f46" : sector.color}
                          selected={active}
                          occupied={seat.status === "blocked"}
                          label={zoom >= 1.2 ? String(seat.number) : undefined}
                          showLabel={zoom >= 1.2}
                        />
                      </g>
                    )
                  })}
                </g>
              ))}
              <VenueMapElementLayer
                elements={(renderMap.elements ?? []).filter(
                  (item) => !selectedIdSet.has(item.id),
                )}
                selectedIds={[]}
                showSeats={(renderMap.elements?.length ?? 0) < 220}
                zoom={zoom}
                popSelected={false}
                onElementPointerDown={onMapElementPointerDown}
                onElementContextMenu={(event, element) =>
                  openObjectMenu(event, { kind: "element", id: element.id })
                }
              />
              <g ref={liveGroupRef}>
                {selectedZone ? (
                  <VenueMapZoneLayer
                    zones={[
                      (renderMap.zones ?? []).find(
                        (zone) => zone.id === selectedZone.id,
                      ) ?? selectedZone,
                    ]}
                    selectedId={selectedZone.id}
                    emphasizeSelected={false}
                    onSelect={
                      tool === "polygon"
                        ? undefined
                        : (zone) => setSelection({ kind: "zone", id: zone.id })
                    }
                    onPointerDown={
                      tool === "polygon" ? undefined : onZonePointerDown
                    }
                    onContextMenu={(event, zone) =>
                      openObjectMenu(event, { kind: "zone", id: zone.id })
                    }
                  />
                ) : null}
                <g ref={selectedVisualRef}>
                  <VenueMapElementLayer
                    elements={(renderMap.elements ?? []).filter((item) =>
                      selectedIdSet.has(item.id),
                    )}
                    selectedIds={selectedElementIds}
                    showSeats={(renderMap.elements?.length ?? 0) < 220}
                    zoom={zoom}
                    popSelected={false}
                    onElementPointerDown={onMapElementPointerDown}
                    onElementContextMenu={(event, element) =>
                      openObjectMenu(event, { kind: "element", id: element.id })
                    }
                  />
                </g>
                {transformBounds && !geometryLocked ? (
                  <SvgTransformBox
                    bounds={transformBounds}
                    zoom={zoom}
                    grabbing={transformingKind === "move"}
                    fatFinger={compactChrome}
                    onMoveStart={(event) => {
                      if (selectedZone) {
                        beginGroupMove([], event, selectedZone.id)
                        return
                      }
                      if (selectedElementIds.length === 0) return
                      beginGroupMove(selectedElementIds, event)
                    }}
                    onResizeStart={(handle, event) =>
                      beginScale(handle, transformBounds, event)
                    }
                    onRotateStart={(event) => beginRotate(transformBounds, event)}
                  />
                ) : null}
              </g>
              {map.labels.map((label) => (
                <text
                  key={label.id}
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fill={label.color}
                  className="cursor-pointer text-[15px] font-black tracking-[0.22em]"
                  onContextMenu={(event) => openObjectMenu(event, { kind: "label", id: label.id })}
                  onPointerDown={(event) => {
                    if (wantsCanvasPan(event)) return
                    event.stopPropagation()
                    if (event.button !== 0) return
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
                  className="fill-sky-400/15 stroke-sky-500"
                  strokeDasharray="6 4"
                  strokeWidth={1.25 / Math.max(0.25, zoom)}
                  pointerEvents="none"
                />
              ) : null}
            </g>
          </svg>
          {isStudio && tool !== "polygon" ? (
            <VenueStudioHud
              map={map}
              className={compactChrome ? "top-3 bottom-auto" : undefined}
            />
          ) : null}
          {compactChrome && lassoMode && tool === "select" ? (
            <div className="pointer-events-none absolute top-14 left-1/2 z-20 -translate-x-1/2 rounded-full border border-sky-400/40 bg-zinc-950/90 px-3 py-1.5 text-xs text-sky-100">
              Selección múltiple: arrastrá para encerrar
            </div>
          ) : null}
          {tool === "polygon" ? (
            <div
              className={cn(
                "pointer-events-none absolute left-1/2 z-20 w-[min(100%-1.5rem,28rem)] -translate-x-1/2 rounded-full border border-cyan-400/30 bg-zinc-950/90 px-4 py-2 text-center text-xs text-cyan-100",
                compactChrome ? "bottom-24" : "bottom-3",
              )}
            >
              Clic: vértice. Clic en el primero, Enter o doble clic: cerrar. Escape: cancelar.
            </div>
          ) : null}
          {compactChrome &&
          selection &&
          !geometryLocked &&
          !mobileSheetOpen ? (
            <VenueNudgePad
              className="absolute right-3 z-40 bottom-[5.5rem]"
              onNudge={nudgeSelection}
            />
          ) : null}
        </div>

        <StudioInspectorFrame
          isStudio={isStudio}
          isDesktop={isDesktop}
          open={propertiesOpen}
          onOpenChange={setPropertiesOpen}
          propertiesRef={propertiesRef}
          title={
            workMode === "pricing"
              ? "Tarifas"
              : workMode === "indexing"
                ? "Indexación"
                : "Propiedades"
          }
          description={
            workMode === "pricing"
              ? "Precio y color en el panel. El mapa sigue visible arriba."
              : workMode === "indexing"
                ? "Numeración de filas y asientos del bloque seleccionado."
                : "Editá el elemento. El plano queda visible arriba."
          }
        >
          {isStudio ? (
            <div className="hidden shrink-0 border-b border-border px-4 py-3 md:block">
              <p className="text-sm font-semibold text-foreground">
                {workMode === "pricing"
                  ? "Tarifas"
                  : workMode === "indexing"
                    ? "Indexación"
                    : selectedElementIds.length > 1
                      ? `${selectedElementIds.length} Elementos seleccionados`
                      : selectedElementIds.length === 1 || selection
                        ? "Propiedades"
                        : "Predio"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {workMode === "pricing"
                  ? "Precio y color en el panel. El mapa no se mueve."
                  : workMode === "indexing"
                    ? "Numeración de filas y asientos del bloque seleccionado."
                    : selectedElementIds.length > 1
                      ? "Edición masiva del grupo."
                      : selectedElementIds.length === 1
                        ? "Ficha del elemento activo."
                        : selection
                          ? "Edición del elemento activo."
                          : "Foto aérea y medidas del recinto."}
              </p>
            </div>
          ) : (
            <div className="hidden md:block">
              <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-500 uppercase">
                Propiedades
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {capacity} {capacity === 1 ? "lugar configurado" : "lugares configurados"}
              </p>
            </div>
          )}
          <div
            className={cn(
              isStudio
                ? "min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
                : compactChrome
                  ? "space-y-4 p-4"
                  : "contents",
            )}
          >
          {workMode === "pricing" ? (
            <VenueHeatmapPanel
              map={map}
              activeKey={activePriceGroup?.key}
              onSelectGroup={selectPriceGroup}
              onPatchGroup={patchPriceGroup}
            />
          ) : workMode === "indexing" ? (
            <div className="space-y-4">
              <AutoNumberingPanel
                elements={ensureElements(map)}
                selectedIds={selectedElementIds}
                onApply={applySelectedElements}
              />
              {selectedElement ? (
                <Field label="Excepción de esta pieza">
                  <Input
                    value={selectedElement.label}
                    onChange={(event) =>
                      patchElement(selectedElement.id, {
                        label: event.target.value,
                        labelLocked: true,
                      })
                    }
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Doble clic o clic derecho también edita una sola butaca sin
                    renumerar la fila.
                  </p>
                </Field>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Clic en un bloque agrupado para numerarlo. Ctrl+G agrupa.
                  Ctrl+Shift+G desagrupa.
                </p>
              )}
            </div>
          ) : (
            <>
          {showRings ? (
            <ConcentricRingGenerator onGenerate={applyGeneratedRing} />
          ) : null}

          {tool === "polygon" ? (
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-3">
              <p className="flex items-start gap-2 text-sm font-semibold leading-snug">
                <PenTool className="mt-0.5 size-4 shrink-0 text-cyan-400" />
                Trazado de zona
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Clic para cada vértice sobre la foto. Clic cerca del primero,
                Enter o doble clic cierra el polígono (mínimo 3 puntos). Escape
                cancela. Después configurás filas y mesas a la derecha, sin
                dibujar cada una.
              </p>
              {polygonDraft.length >= 3 ? (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={closePolygonDraft}
                >
                  <Send className="size-4" />
                  Cerrar zona ({polygonDraft.length} puntos)
                </Button>
              ) : null}
            </div>
          ) : null}

          {selectedZone ? (
            <VenueParametricRulesPanel
              zone={selectedZone}
              autoFocusName={rulesFocusId === selectedZone.id}
              onChange={(patch) => patchZone(selectedZone.id, patch)}
            />
          ) : selectedSector ? (
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
                <PriceInput
                  value={selectedSector.price}
                  onValueChange={(value) => {
                    if (value == null) return
                    patchSector(selectedSector.id, { price: value })
                  }}
                />
              </Field>
              <Field label="Capacidad">
                <Input
                  type="number"
                  min={1}
                  value={
                    selectedSector.seats.filter(
                      (seat) => seat.status !== "blocked",
                    ).length ||
                    selectedSector.rows * selectedSector.seatsPerRow
                  }
                  readOnly
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
          ) : selectedElement && isInfrastructureElement(selectedElement) ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-muted/60 px-3 py-3">
                <p className="flex items-start gap-2 text-sm font-semibold leading-snug text-foreground">
                  <Info className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  Elemento de referencia visiva (no cobrable)
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  El comprador lo ve en el mapa para orientarse. No tiene
                  precio ni se puede comprar.
                </p>
              </div>
              <Field label="Nombre que se ve en el mapa">
                <Input
                  value={selectedElement.label}
                  onChange={(event) =>
                    patchElement(selectedElement.id, {
                      label: event.target.value,
                    })
                  }
                  placeholder="Ej. Baños Sector Norte"
                />
              </Field>
              <InspectorShapeSelector
                element={selectedElement}
                onChange={(patch) => patchElement(selectedElement.id, patch)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Ancho">
                  <Input
                    type="number"
                    min={24}
                    value={selectedElement.width}
                    onChange={(event) =>
                      patchElement(selectedElement.id, {
                        width: Number(event.target.value) || 24,
                      })
                    }
                  />
                </Field>
                <Field label="Alto">
                  <Input
                    type="number"
                    min={24}
                    value={selectedElement.height}
                    onChange={(event) =>
                      patchElement(selectedElement.id, {
                        height: Number(event.target.value) || 24,
                      })
                    }
                  />
                </Field>
              </div>
              <Field label={`Rotación (${Math.round(selectedElement.rotation)}°)`}>
                <div className="flex items-center gap-2">
                  <RotateCw className="size-4 shrink-0 text-muted-foreground" />
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
              <Field
                label={`Transparencia (${Math.round((selectedElement.opacity ?? 1) * 100)}%)`}
              >
                <input
                  type="range"
                  min={30}
                  max={100}
                  value={Math.round((selectedElement.opacity ?? 1) * 100)}
                  onChange={(event) =>
                    patchElement(selectedElement.id, {
                      opacity: Number(event.target.value) / 100,
                    })
                  }
                  className="w-full accent-emerald-500"
                />
              </Field>
              <Button type="button" variant="outline" onClick={duplicateSelection}>
                <Copy className="size-4" />
                Duplicar
              </Button>
            </div>
          ) : selectedElement ? (
            <div className="space-y-3">
              <Field label="Nombre / etiqueta">
                <Input
                  value={selectedElement.label}
                  onChange={(event) =>
                    patchElement(selectedElement.id, {
                      label: event.target.value,
                      labelLocked: true,
                    })
                  }
                />
                <div className="flex items-center justify-between gap-3 pt-1">
                  <Label
                    htmlFor="label-locked"
                    className="text-xs font-normal leading-snug text-muted-foreground"
                  >
                    No cambiar al numerar el bloque
                  </Label>
                  <Switch
                    id="label-locked"
                    size="sm"
                    checked={selectedElement.labelLocked === true}
                    onCheckedChange={(checked) =>
                      patchElement(selectedElement.id, { labelLocked: checked })
                    }
                    aria-label="No cambiar al numerar el bloque"
                  />
                </div>
              </Field>
              <Field label="Nombre del sector (para el precio)">
                <Input
                  value={selectedElement.sectorName}
                  onChange={(event) =>
                    patchElement(selectedElement.id, {
                      sectorName: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label={venueUnitPriceLabel({ type: selectedElement.type, sellMode: selectedElement.sellMode, priceMode: selectedElement.priceMode })}>
                <PriceInput
                  value={selectedElement.price}
                  onValueChange={(value) => {
                    if (value == null) return
                    patchElement(selectedElement.id, { price: value })
                  }}
                />
              </Field>
              <Field label="Color">
                <div className="space-y-2">
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
                      className="h-11 w-full cursor-pointer rounded border border-zinc-700 bg-transparent"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px] w-full"
                    onClick={selectSimilarByColor}
                  >
                    <Wand2 className="size-4" />
                    Seleccionar todos de este color
                  </Button>
                </div>
              </Field>
              <InspectorShapeSelector
                element={selectedElement}
                onChange={(patch) => patchElement(selectedElement.id, patch)}
              />
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
                <VenuePriceModeControl
                  id={selectedElement.id}
                  value={
                    selectedElement.priceMode ??
                    venuePriceModeFromSellMode(selectedElement.sellMode)
                  }
                  onChange={(next) => patchElement(selectedElement.id, next)}
                />
              ) : null}
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
              {selectedElement.groupId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={ungroupSelection}
                >
                  <Ungroup className="size-4" />
                  Desagrupar
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={duplicateSelection}>
                <Copy className="size-4" />
                Duplicar
              </Button>
            </div>
          ) : selection?.kind === "elements" ? (
            <div className="space-y-4">
              <VenueBulkEditPanel
                elements={selectedElements}
                allElements={ensureElements(map)}
                selectedIds={selectedElementIds}
                onPrice={batchPrice}
                onColor={batchColor}
                onCapacity={batchCapacity}
                onApplyElements={applySelectedElements}
                showNumbering={false}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={groupSelection}
                >
                  <Group className="size-4" />
                  Agrupar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  disabled={!selectionHasGroup(selectedElements, selectedElementIds)}
                  onClick={ungroupSelection}
                >
                  <Ungroup className="size-4" />
                  Desagrupar
                </Button>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Alinear</p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] w-full"
                  title="Distribuir en un arco mirando al escenario"
                  onClick={alignSelectionOnCurve}
                >
                  <Spline className="size-4" />
                  Alinear en curva
                </Button>
                <div className="grid grid-cols-3 gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    title="Alinear a la izquierda"
                    onClick={() => alignSelection("left")}
                  >
                    <AlignStartVertical className="size-4" />
                    Izq
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    title="Centrar horizontalmente"
                    onClick={() => alignSelection("centerX")}
                  >
                    <AlignCenterVertical className="size-4" />
                    Centro
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    title="Alinear a la derecha"
                    onClick={() => alignSelection("right")}
                  >
                    <AlignEndVertical className="size-4" />
                    Der
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    title="Alinear arriba"
                    onClick={() => alignSelection("top")}
                  >
                    <AlignStartHorizontal className="size-4" />
                    Arriba
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    title="Centrar verticalmente"
                    onClick={() => alignSelection("centerY")}
                  >
                    <AlignCenterHorizontal className="size-4" />
                    Medio
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    title="Alinear abajo"
                    onClick={() => alignSelection("bottom")}
                  >
                    <AlignEndHorizontal className="size-4" />
                    Abajo
                  </Button>
                </div>
              </div>
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
            <div className="space-y-4">
              {!isStudio ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Arrastrá componentes al plano. Clic izquierdo abre la ficha.
                  Clic derecho duplica, gira o borra.
                </p>
              ) : null}
              {isStudio ? (
                <>
                  <VenueMapBackgroundPanel
                    map={map}
                    onChange={(patch) => commit({ ...mapRef.current, ...patch })}
                  />
                  <div className="space-y-3 rounded-xl border border-border bg-background p-3">
                    <p className="text-sm font-semibold text-foreground">
                      Dimensiones del predio
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Lienzo de trabajo {CANVAS.width} × {CANVAS.height} px. Usá
                      la escala y la posición de la foto para encajar el recinto.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Ancho (px)">
                        <Input value={CANVAS.width} readOnly />
                      </Field>
                      <Field label="Alto (px)">
                        <Input value={CANVAS.height} readOnly />
                      </Field>
                    </div>
                    <Field
                      label={`Escala de encaje (${Math.round((map.backgroundScale ?? 1) * 100)}%)`}
                    >
                      <input
                        type="range"
                        min={20}
                        max={250}
                        value={Math.round((map.backgroundScale ?? 1) * 100)}
                        onChange={(event) =>
                          commit({
                            ...mapRef.current,
                            backgroundScale: Number(event.target.value) / 100,
                          })
                        }
                        className="w-full accent-emerald-500"
                      />
                    </Field>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {selection ? (
            <Button type="button" variant="destructive" onClick={deleteSelection}>
              <Trash2 className="size-4" />
              {selection.kind === "seats"
                ? "Desactivar seleccionadas"
                : selection.kind === "elements"
                  ? "Eliminar seleccionados"
                  : "Eliminar"}
            </Button>
          ) : null}

          {!isStudio ? (
            <VenueMapBackgroundPanel
              map={map}
              onChange={(patch) => commit({ ...mapRef.current, ...patch })}
            />
          ) : null}
            </>
          )}
          </div>
        </StudioInspectorFrame>
      </div>

      {compactChrome ? (
        <>
          {!mobileSheetOpen ? (
            <div className="absolute bottom-4 left-1/2 z-50 flex w-[calc(100%-1.5rem)] -translate-x-1/2 justify-center overflow-x-auto pb-[env(safe-area-inset-bottom)] hide-scrollbar">
              <VenueMobileFabBar
                showAdd={workMode === "architecture"}
                showProperties={hasPropertiesTarget}
                lassoMode={lassoMode}
                canUndo={canUndo}
                canRedo={canRedo}
                onAdd={() => setToolsOpen(true)}
                onModes={() => setModesOpen(true)}
                onLasso={() => setLassoMode((value) => !value)}
                onUndo={undo}
                onRedo={redo}
                onProperties={() => setPropertiesOpen(true)}
              />
            </div>
          ) : null}
          <Sheet open={toolsOpen} onOpenChange={setToolsOpen}>
            <SheetContent
              side="bottom"
              overlayClassName="bg-black/20"
              className="h-[48dvh] max-h-[48dvh] gap-0 p-0"
            >
              <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" />
              <SheetHeader>
                <SheetTitle>Agregar elemento</SheetTitle>
                <SheetDescription>
                  Elegí mesas, zonas o referencias. El plano queda visible arriba.
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
                <VenueComponentPalette
                  variant="studio"
                  surface="sheet"
                  active={placement}
                  onPick={pickPaletteItem}
                />
              </div>
            </SheetContent>
          </Sheet>
          <Sheet open={modesOpen} onOpenChange={setModesOpen}>
            <SheetContent
              side="bottom"
              overlayClassName="bg-black/20"
              className="h-[48dvh] max-h-[48dvh] gap-0 p-0"
            >
              <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" />
              <SheetHeader>
                <SheetTitle>Modos</SheetTitle>
                <SheetDescription>
                  Arquitectura, indexación o tarifas.
                </SheetDescription>
              </SheetHeader>
              <VenueWorkModeTabs
                layout="stack"
                value={workMode}
                onChange={(mode) => {
                  setStudioWorkMode(mode)
                  setModesOpen(false)
                }}
              />
            </SheetContent>
          </Sheet>
        </>
      ) : null}

      <VenueCanvasContextMenu
        open={Boolean(contextMenu)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        canRotate={contextMenu?.target.kind === "element"}
        canDuplicate={contextMenu?.target.kind !== "stage"}
        canRenumber={
          contextMenu?.target.kind === "element" ||
          contextMenu?.target.kind === "sector" ||
          contextMenu?.target.kind === "label"
        }
        onOpenChange={(open) => {
          if (!open) setContextMenu(null)
        }}
        onEdit={focusProperties}
        onDuplicate={() => {
          if (contextMenu) duplicateTarget(contextMenu.target)
        }}
        onRotate={() => {
          if (contextMenu?.target.kind === "element") {
            rotateSelection(90, [contextMenu.target.id])
          }
        }}
        onRenumber={(value) => {
          const target = contextMenu?.target
          if (!target || !value.trim()) return
          if (target.kind === "element") {
            const current = mapRef.current
            commit({
              ...current,
              elements: applyLabelOverride(
                ensureElements(current),
                target.id,
                value,
              ),
            })
          } else if (target.kind === "sector") {
            patchSector(target.id, { name: value.trim() })
          } else if (target.kind === "label") {
            const current = mapRef.current
            commit({
              ...current,
              labels: current.labels.map((label) =>
                label.id === target.id ? { ...label, text: value.trim() } : label,
              ),
            })
          }
        }}
        onDelete={deleteSelection}
      />

      <GridArrayDialog
        open={gridArrayOpen}
        onOpenChange={(open) => {
          setGridArrayOpen(open)
          if (!open) setGridArrayOrigin(null)
        }}
        onGenerate={applyGridBlock}
      />

      <LabelOverrideDialog
        open={Boolean(labelOverride)}
        value={labelOverride?.value ?? ""}
        onValueChange={(value) =>
          setLabelOverride((current) =>
            current ? { ...current, value } : current,
          )
        }
        onOpenChange={(open) => {
          if (!open) setLabelOverride(null)
        }}
        onSave={saveLabelOverride}
      />

      {preview && !onPreview ? (
        <BuyerViewModal
          open={true}
          map={map}
          eventTitle={eventTitle}
          onClose={() => setPreview(false)}
        />
      ) : null}

      {isStudio && libraryOpen ? (
        <VenueTemplateLibrary
          customTemplates={customTemplates}
          onSkip={
            venueMapHasInventory(map) ? () => setLibraryOpen(false) : undefined
          }
          onPickBuiltin={pickBuiltin}
          onPickCustom={(next) => loadMap(next, true)}
          onDeleteCustom={(id) => {
            startTemplates(() => {
              void deleteOrganizerVenueTemplate(id).then((result) => {
                if (!result.success) {
                  toast.error(result.error)
                  return
                }
                toast.success("Plantilla eliminada")
                refreshTemplates()
              })
            })
          }}
        />
      ) : null}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar como Mi Plantilla</DialogTitle>
            <DialogDescription>
              Conservá este recinto para reutilizarlo en otros eventos sin
              volver a dibujarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="venue-template-name">Nombre de la plantilla</Label>
            <Input
              id="venue-template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Ej. Teatro Colón sala principal"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pendingTemplates}
              onClick={() => {
                startTemplates(() => {
                  void saveOrganizerVenueTemplate({
                    name: templateName,
                    map,
                  }).then((result) => {
                    if (!result.success) {
                      toast.error(result.error)
                      return
                    }
                    toast.success("Plantilla guardada")
                    setSaveOpen(false)
                    refreshTemplates()
                  })
                })
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StudioInspectorFrame({
  isStudio,
  isDesktop,
  open,
  onOpenChange,
  propertiesRef,
  title = "Propiedades",
  description = "Editá nombre, precio y reglas del elemento seleccionado.",
  children,
}: {
  isStudio: boolean
  isDesktop: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  propertiesRef: React.RefObject<HTMLElement | null>
  title?: string
  description?: string
  children: React.ReactNode
}) {
  if (isDesktop && !isStudio) {
    return (
      <aside
        ref={propertiesRef}
        className="flex flex-col space-y-4 overflow-y-auto border-t border-border bg-card/50 p-4 lg:max-h-[min(70vh,560px)] lg:border-t-0 lg:border-l"
      >
        {children}
      </aside>
    )
  }

  if (isDesktop) {
    return (
      <aside
        ref={propertiesRef}
        className="flex h-full w-80 shrink-0 flex-col overflow-hidden border-l border-border bg-card"
      >
        {children}
      </aside>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        overlayClassName="bg-black/20"
        className="h-[48dvh] max-h-[48dvh] gap-0 p-0"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" />
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div
          ref={(node) => {
            propertiesRef.current = node
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ToolButton({
  active,
  onClick,
  label,
  children,
  disabled = false,
  showLabel = false,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
  disabled?: boolean
  showLabel?: boolean | "md"
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      onClick={onClick}
      disabled={disabled}
      className={cn("h-9 shrink-0 gap-1.5 px-2 md:px-3", active && "ring-1 ring-emerald-500/40")}
    >
      {children}
      {showLabel === true ? (
        <span>{label}</span>
      ) : showLabel === "md" ? (
        <span className="hidden md:inline">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
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
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
