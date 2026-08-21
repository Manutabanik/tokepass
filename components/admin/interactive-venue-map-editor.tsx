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
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Redo,
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
import Link from "next/link"
import { toast } from "sonner"

import { VenueBulkEditPanel } from "@/components/admin/venue-bulk-edit-panel"
import { GridArrayDialog } from "@/components/admin/grid-array-dialog"
import { LabelOverrideDialog } from "@/components/admin/label-override-dialog"
import { VenueHeatmapPanel } from "@/components/admin/venue-heatmap-panel"
import { VenueWorkModeTabs, type VenueWorkMode } from "@/components/admin/venue-work-mode-tabs"
import { VenueAutosaveBadge } from "@/components/admin/venue-autosave-badge"
import { AutoNumberingPanel } from "@/components/admin/auto-numbering-panel"
import { VenueManualEditPanel } from "@/components/admin/venue-manual-edit-panel"
import { BuyerViewModal } from "@/components/admin/buyer-view-modal"
import { ConcentricRingGenerator } from "@/components/admin/concentric-ring-generator"
import { VenueCanvasContextMenu } from "@/components/admin/venue-canvas-context-menu"
import { VenueComponentPalette, type PalettePlacement } from "@/components/admin/venue-component-palette"
import { VenueFloatingToolbar, type FloatingDrawTool } from "@/components/admin/venue-floating-toolbar"
import {
  VenueLayerTree,
  type LayerTreeSelection,
} from "@/components/admin/venue-layer-tree"
import { VenueMapBackgroundPanel } from "@/components/admin/venue-map-background-panel"
import { VenueParametricRulesPanel } from "@/components/admin/venue-parametric-rules-panel"
import { VenueSetupGuide } from "@/components/admin/venue-setup-guide"
import { SvgTransformBox } from "@/components/admin/svg-transform-box"
import { VenueSelectionToolbar } from "@/components/admin/venue-selection-toolbar"
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
import { canvasLabelFill } from "@/lib/seating/canvas-label-fill"
import {
  applyLabelOverride,
  applyMatrixNumbering,
} from "@/lib/seating/auto-numbering"
import {
  composeManualSeatLabel,
  parseManualSeatFields,
  parseSeatNumberInput,
} from "@/lib/seating/manual-seat-edit"
import {
  applyHeatmapColors,
} from "@/lib/seating/venue-heatmap"
import {
  elementGroupMembers,
  elementsInGroup,
  expandElementSelection,
  groupVenueElements,
  selectionFromIds,
  selectionHasGroup,
  selectionIsFullyLocked,
  selectionIsLogicalGroup,
  toggleElementsLocked,
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
  explodeVenueSectorToChairs,
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
  alignSelectedToCenter,
  distributeSelectedHorizontally,
  angleAt,
  applyMoveSnap,
  applyMoveSnapFromOrigin,
  applyRotateSnap,
  applyLiveToSeats,
  bakeLiveTransform,
  boundsCenter,
  rotationDeltaFromPointer,
  clampScale,
  clampVenueZoom,
  elementAabb,
  expandViewBoxToContainer,
  fitViewportToWorldBox,
  flipSelectedElements,
  liveTransformToSvg,
  normalizeDeg,
  pointsToBounds,
  resizeOrigin,
  rotateElementsAround,
  selectionBounds,
  translateElements,
  VENUE_VIEW_PADDING,
  zoomTowardCursor,
  type BoundsRect,
  type LiveTransform,
  type ResizeHandle,
} from "@/lib/seating/venue-transform"
import {
  applyTwoFingerViewport,
  emptyCanvasDragAction,
  isolateCanvasPointer,
  isIntentionalSheetClose,
  nowMs,
  SHEET_DISMISS_GUARD_MS,
  shouldIgnoreSheetDismiss,
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
import {
  distributeOnArc,
  generateGridArray,
} from "@/lib/seating/venue-array"
import {
  CONTEXT_FOCUS_ANIM_MS,
  elementBelongsToZone,
  seatBelongsToZone,
  zoneCanvasAabb,
} from "@/lib/seating/venue-map-lod"
import { type VenueMapSkuTicketRef } from "@/lib/seating/venue-map-sku-consistency"
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
  type VenueMapSeat,
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
      target?: "seats"
      startX: number
      startY: number
      originX: number
      originY: number
    }
  | {
      mode: "scale"
      ids: string[]
      zoneId?: string
      target?: "seats"
      ox: number
      oy: number
      startDist: number
      handle: ResizeHandle
    }
  | {
      mode: "rotate"
      ids: string[]
      zoneId?: string
      target?: "seats"
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

type SelectedSeatEntry = {
  key: string
  x: number
  y: number
  source: "sector" | "element"
  ownerId: string
  seatId: string
}

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
  onEventTitleChange,
  backHref,
  backLabel = "Volver al Panel",
}: {
  value?: InteractiveVenueMap | null
  onChange: (map: InteractiveVenueMap, seatingLayout: VenueSeatingLayout) => void
  onSave?: (map: InteractiveVenueMap) => void | Promise<void>
  onAutoSave?: (map: InteractiveVenueMap) => void | Promise<void>
  onClose?: () => void
  onPreview?: () => void
  saving?: boolean
  variant?: "card" | "studio" | "workspace"
  eventTitle?: string
  onEventTitleChange?: (title: string) => void
  backHref?: string
  backLabel?: string
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
  const [paletteCollapsed, setPaletteCollapsed] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [svgViewBox, setSvgViewBox] = useState<{
    x: number
    y: number
    width: number
    height: number
  }>({
    x: 0,
    y: 0,
    width: CANVAS.width,
    height: CANVAS.height,
  })
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
  const [isolationId, setIsolationId] = useState<string | null>(null)
  const isolationIdRef = useRef<string | null>(null)
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null)
  const activeZoneIdRef = useRef<string | null>(null)
  const overviewViewportRef = useRef<{
    pan: { x: number; y: number }
    zoom: number
  } | null>(null)
  const viewportAnimRef = useRef<number | null>(null)
  const svgViewBoxRef = useRef(svgViewBox)
  const [seatEditMode, setSeatEditMode] = useState(false)
  const seatEditModeRef = useRef(false)
  const [explicitSaveStatus, setExplicitSaveStatus] = useState<
    "saving" | "saved" | "error" | null
  >(null)
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null)
  const hoverClearTimer = useRef<number | null>(null)
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
  const saveBadgeStatus =
    explicitSaveStatus === "saving" ||
    explicitSaveStatus === "saved" ||
    explicitSaveStatus === "error"
      ? explicitSaveStatus
      : autosaveStatus === "dirty" || autosaveStatus === "saving"
        ? autosaveStatus
        : (explicitSaveStatus ?? autosaveStatus)
  const mapBusy = saving || explicitSaveStatus === "saving"

  async function persistEditorMap() {
    if (!onSave) return
    setExplicitSaveStatus("saving")
    try {
      await onSave(mapRef.current)
      setExplicitSaveStatus("saved")
      toast.success("Guardado")
    } catch (error) {
      setExplicitSaveStatus("error")
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar el mapa",
      )
    }
  }
  useLayoutEffect(() => {
    isolationIdRef.current = isolationId
    activeZoneIdRef.current = activeZoneId
    workModeRef.current = workMode
    selectionRef.current = selection
    compactChromeRef.current = compactChrome
    lassoModeRef.current = lassoMode
    seatEditModeRef.current = seatEditMode
    mapRef.current = map
    toolRef.current = tool
    polygonDraftRef.current = polygonDraft
    svgViewBoxRef.current = svgViewBox
  }, [
    isolationId,
    activeZoneId,
    workMode,
    selection,
    compactChrome,
    lassoMode,
    seatEditMode,
    map,
    tool,
    polygonDraft,
    svgViewBox,
  ])
  useEffect(() => {
    return () => {
      if (viewportAnimRef.current != null) {
        cancelAnimationFrame(viewportAnimRef.current)
      }
    }
  }, [])
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
  const selectedElementIdsRef = useRef<string[]>([])
  const toolRef = useRef(tool)
  const polygonDraftRef = useRef(polygonDraft)
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
  const lassoModeRef = useRef(lassoMode)
  const pinchRef = useRef<PinchOrigin | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const isSelectingRef = useRef(false)
  const pendingMobileProperties = useRef(false)
  const sheetGuardUntil = useRef(0)
  const sheetGuardTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!value) return
    const next = parseVenueMap(value)
    if (JSON.stringify(next) === JSON.stringify(mapRef.current)) return
    setMap(next)
    mapRef.current = next
  }, [value])

  useEffect(() => {
    return () => {
      if (hoverClearTimer.current != null) {
        window.clearTimeout(hoverClearTimer.current)
      }
      if (sheetGuardTimer.current != null) {
        window.clearTimeout(sheetGuardTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    queueMicrotask(() => {
      setLassoMode(false)
      setToolsOpen(false)
      setPropertiesOpen(false)
      setModesOpen(false)
    })
  }, [isDesktop])

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
    setActiveZoneId(null)
    setIsolationId(null)
    overviewViewportRef.current = null
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
  const activeZone = useMemo(
    () =>
      activeZoneId
        ? (map.zones ?? []).find((zone) => zone.id === activeZoneId) ?? null
        : null,
    [activeZoneId, map.zones],
  )
  const isolationDimElementIds = useMemo(() => {
    if (!activeZone) return null
    const ids = new Set<string>()
    for (const element of map.elements ?? []) {
      if (!elementBelongsToZone(element, activeZone)) ids.add(element.id)
    }
    return ids
  }, [activeZone, map.elements])
  const selectedElement =
    selection?.kind === "element"
      ? (map.elements ?? []).find((item) => item.id === selection.id) ?? null
      : selection?.kind === "elements" && selection.ids.length === 1
        ? (map.elements ?? []).find((item) => item.id === selection.ids[0]) ??
          null
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
  useEffect(() => {
    selectedElementIdsRef.current = selectedElementIds
  }, [selectedElementIds])
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
  const selectedSeatEntries = useMemo((): SelectedSeatEntry[] => {
    if (preview || tool !== "select" || placement) return []
    if (selection?.kind === "sector") {
      const sector = map.sectors.find((item) => item.id === selection.id)
      return (sector?.seats ?? []).map((seat) => ({
        key: seatKey(sector!.id, seat.id),
        x: seat.x,
        y: seat.y,
        source: "sector",
        ownerId: sector!.id,
        seatId: seat.id,
      }))
    }
    if (selection?.kind !== "seats") return []
    return selection.ids.flatMap((key): SelectedSeatEntry[] => {
      const { ownerId, seatId } = parseSeatSelectionKey(key)
      const sector = map.sectors.find((item) => item.id === ownerId)
      const sectorSeat = sector?.seats.find((item) => item.id === seatId)
      if (sector && sectorSeat) {
        return [
          {
            key,
            x: sectorSeat.x,
            y: sectorSeat.y,
            source: "sector" as const,
            ownerId,
            seatId,
          },
        ]
      }
      const element = (map.elements ?? []).find((item) => item.id === ownerId)
      const elementSeat = element?.seats.find((item) => item.id === seatId)
      if (element && elementSeat) {
        return [
          {
            key,
            x: elementSeat.x,
            y: elementSeat.y,
            source: "element" as const,
            ownerId,
            seatId,
          },
        ]
      }
      return []
    })
  }, [map.elements, map.sectors, placement, preview, selection, tool])
  const selectedSeatBounds = useMemo(
    () =>
      selectedSeatEntries.length > 0
        ? pointsToBounds(selectedSeatEntries)
        : null,
    [selectedSeatEntries],
  )
  const liveSeatKeys = useMemo(
    () => new Set(selectedSeatEntries.map((item) => item.key)),
    [selectedSeatEntries],
  )
  const selectedZoneBounds =
    !preview && tool === "select" && !placement && selectedZone
      ? (() => {
          const box = zoneCanvasAabb(selectedZone)
          return box ? aabbToRect(box) : null
        })()
      : null
  const transformBounds =
    selectedZoneBounds ??
    selectedSeatBounds ??
    measuredBounds ??
    computedBounds
  const seatGizmoActive = selectedSeatEntries.length > 0 && selectedElementIds.length === 0
  const geometryLocked = workMode === "pricing"
  const selectionLocked = selectedElements.some((item) => item.isLocked === true)
  const selectionFullyLocked = selectionIsFullyLocked(
    selectedElements,
    selectedElementIds,
  )
  const canTidyUp =
    selectedElementIds.length > 1 &&
    !selectionIsLogicalGroup(selectedElements, selectedElementIds)
  const hoverGroupBounds = useMemo(() => {
    if (!hoveredGroupId || isolationId) return null
    const members = elementsInGroup(map.elements ?? [], hoveredGroupId)
    if (members.length < 2) return null
    const selectedIsHoveredGroup =
      selectedElements.length > 1 &&
      selectedElements.every(
        (item) => item.groupId?.trim() === hoveredGroupId,
      )
    if (selectedIsHoveredGroup) return null
    return selectionBounds(members)
  }, [
    hoveredGroupId,
    isolationId,
    map.elements,
    selectedElements,
  ])
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
    if (drag.target === "seats") {
      const keys = new Set(drag.ids)
      paintLive(null)
      commit({
        ...current,
        sectors: current.sectors.map((sector) => ({
          ...sector,
          seats: sector.seats.map((seat) =>
            keys.has(seatKey(sector.id, seat.id))
              ? applyLiveToSeats([seat], snapped)[0]!
              : seat,
          ),
        })),
        elements: ensureElements(current).map((item) => ({
          ...item,
          seats: item.seats.map((seat) =>
            keys.has(elementSeatKey(item.id, seat.id))
              ? applyLiveToSeats([seat], snapped)[0]!
              : seat,
          ),
        })),
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

  function idsAreLocked(ids: string[]) {
    if (ids.length === 0) return false
    const locked = new Set(ids)
    return ensureElements(mapRef.current).some(
      (item) => locked.has(item.id) && item.isLocked === true,
    )
  }

  function beginGroupMove(
    ids: string[],
    event: React.PointerEvent,
    zoneId?: string,
  ) {
    const seatIds = selectedSeatEntries.map((item) => item.key)
    const usingSeats = !zoneId && ids.length === 0 && seatIds.length > 0
    if (!zoneId && !usingSeats && idsAreLocked(ids)) return
    const point = pointerToSvg(event)
    capturePointer(event)
    transformDrag.current = {
      mode: "move",
      ids: usingSeats ? seatIds : ids,
      zoneId,
      target: usingSeats ? "seats" : undefined,
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
    if (seatGizmoActive) return
    if (idsAreLocked(selectedElementIds)) return
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
    const seatIds = selectedSeatEntries.map((item) => item.key)
    const usingSeats = seatGizmoActive
    if (!usingSeats && idsAreLocked(selectedElementIds)) return
    const point = pointerToSvg(event)
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2
    capturePointer(event)
    const zoneId =
      selectionRef.current?.kind === "zone" ? selectionRef.current.id : undefined
    transformDrag.current = {
      mode: "rotate",
      ids: usingSeats ? seatIds : selectedElementIds,
      zoneId,
      target: usingSeats ? "seats" : undefined,
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

  function armSheetDismissGuard() {
    isSelectingRef.current = true
    sheetGuardUntil.current = nowMs() + SHEET_DISMISS_GUARD_MS
    if (sheetGuardTimer.current != null) {
      window.clearTimeout(sheetGuardTimer.current)
    }
    sheetGuardTimer.current = window.setTimeout(() => {
      isSelectingRef.current = false
      sheetGuardTimer.current = null
    }, SHEET_DISMISS_GUARD_MS)
  }

  function requestMobileProperties() {
    if (!compactChromeRef.current) return
    pendingMobileProperties.current = true
    armSheetDismissGuard()
  }

  function flushMobileProperties() {
    if (!compactChromeRef.current) return
    pendingMobileProperties.current = false
    armSheetDismissGuard()
    setPropertiesOpen(true)
  }

  function openMobilePropertiesSheet() {
    pendingMobileProperties.current = false
    armSheetDismissGuard()
    setPropertiesOpen(true)
  }

  function shouldBlockCanvasDeselect() {
    return (
      isSelectingRef.current ||
      nowMs() < sheetGuardUntil.current ||
      pendingMobileProperties.current
    )
  }

  function handlePropertiesOpenChange(
    open: boolean,
    details?: { reason?: string; cancel?: () => void },
  ) {
    if (open) {
      armSheetDismissGuard()
      setPropertiesOpen(true)
      return
    }
    if (
      shouldIgnoreSheetDismiss({
        reason: details?.reason,
        nowMs: nowMs(),
        guardUntilMs: sheetGuardUntil.current,
      }) ||
      (compactChromeRef.current && !isIntentionalSheetClose(details?.reason))
    ) {
      details?.cancel?.()
      return
    }
    setPropertiesOpen(false)
  }

  function applyElementIds(ids: string[], options?: { isolate?: boolean }) {
    if (!options?.isolate) setIsolationId(null)
    const next = selectionFromIds(ids)
    if (!next) setSelection(null)
    else if (next.kind === "element") setSelection({ kind: "element", id: next.id! })
    else setSelection({ kind: "elements", ids: next.ids! })
  }

  function enterIsolation(id: string) {
    cancelLiveTransform()
    setIsolationId(id)
    applyElementIds([id], { isolate: true })
  }

  function onMapElementPointerEnter(
    _event: React.MouseEvent,
    element: VenueMapElement,
  ) {
    if (hoverClearTimer.current != null) {
      window.clearTimeout(hoverClearTimer.current)
      hoverClearTimer.current = null
    }
    const groupId = element.groupId?.trim()
    setHoveredGroupId(groupId || null)
  }

  function onMapElementPointerLeave() {
    if (hoverClearTimer.current != null) {
      window.clearTimeout(hoverClearTimer.current)
    }
    hoverClearTimer.current = window.setTimeout(() => {
      setHoveredGroupId(null)
      hoverClearTimer.current = null
    }, 40)
  }

  function toggleSelectionLock() {
    if (workModeRef.current === "pricing") return
    if (selectedElementIds.length === 0) return
    const current = mapRef.current
    commit({
      ...current,
      elements: toggleElementsLocked(
        ensureElements(current),
        selectedElementIds,
      ),
    })
  }

  function tidyAlignCenter() {
    if (workModeRef.current === "pricing") return
    if (selectedElementIds.length < 2 || idsAreLocked(selectedElementIds)) return
    const current = mapRef.current
    commit({
      ...current,
      elements: alignSelectedToCenter(
        ensureElements(current),
        selectedElementIds,
        "y",
      ),
    })
  }

  function tidyDistributeHorizontal() {
    if (workModeRef.current === "pricing") return
    if (selectedElementIds.length < 3 || idsAreLocked(selectedElementIds)) return
    const current = mapRef.current
    commit({
      ...current,
      elements: distributeSelectedHorizontally(
        ensureElements(current),
        selectedElementIds,
      ),
    })
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
    const current = mapRef.current
    const activeSelection = selectionRef.current
    if (activeSelection?.kind === "sector") {
      const sector = current.sectors.find(
        (item) => item.id === activeSelection.id,
      )
      if (!sector || sector.seats.length === 0) return
      const chairs = explodeVenueSectorToChairs(sector)
      commit({
        ...current,
        sectors: current.sectors.filter((item) => item.id !== sector.id),
        elements: [...ensureElements(current), ...chairs],
      })
      applyElementIds(chairs.map((item) => item.id))
      setSeatEditMode(false)
      return
    }
    if (selectedElementIds.length === 0) return
    const selected = ensureElements(current).filter((item) =>
      selectedElementIds.includes(item.id),
    )
    commit({
      ...current,
      elements: ungroupVenueElements(
        ensureElements(current),
        selectedElementIds,
      ),
    })
    applyElementIds(selected.map((item) => item.id))
  }

  function setStudioWorkMode(next: VenueWorkMode) {
    if (next === workModeRef.current) return
    setIsolationId(null)
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
    blurCanvasTypingTarget()
    if (wantsCanvasPan(event)) return
    isolateCanvasPointer(event, { preventGhostClick: true })
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
    const items = ensureElements(mapRef.current)
    const grouped = Boolean(target.groupId?.trim())

    if (event.shiftKey) {
      applyElementIds(
        expandElementSelection(
          items,
          target.id,
          selectedElementIds,
          true,
          isolationId ? { isolate: true } : undefined,
        ),
        isolationId ? { isolate: true } : undefined,
      )
      requestMobileProperties()
      return
    }

    if (event.detail >= 2) {
      if (workModeRef.current === "pricing") return
      if (beginElementSeatEdit(target)) return
      if (grouped && isolationId !== target.id) {
        enterIsolation(target.id)
        return
      }
      if (!selectedIdSet.has(target.id)) {
        applyElementIds([target.id], isolationId ? { isolate: true } : undefined)
      }
      setLabelOverride({ id: target.id, value: target.label })
      return
    }

    if (isolationId) {
      const isolated = items.find((item) => item.id === isolationId)
      const sameGroup =
        grouped &&
        Boolean(isolated?.groupId?.trim()) &&
        isolated?.groupId === target.groupId
      if (target.id === isolationId || sameGroup) {
        enterIsolation(target.id)
        requestMobileProperties()
        if (lassoModeRef.current) return
        if (workModeRef.current !== "pricing") {
          beginGroupMove([target.id], event)
        }
        return
      }
    }

    const groupIds = expandElementSelection(
      items,
      target.id,
      selectedElementIds,
      false,
    )
    applyElementIds(groupIds)
    if (lassoModeRef.current) return
    if (workModeRef.current !== "pricing") {
      beginGroupMove(groupIds, event)
    }
    requestMobileProperties()
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
    setExplicitSaveStatus(null)
    onChange(next, venueMapToSeatingLayout(next))
  }

  function blurCanvasTypingTarget() {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return
    if (active === document.body) return
    if (active.isContentEditable || active.closest("input, textarea, select")) {
      active.blur()
    }
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

  function easeViewport(t: number) {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
  }

  function animateViewport(to: { pan: { x: number; y: number }; zoom: number }) {
    if (viewportAnimRef.current != null) {
      cancelAnimationFrame(viewportAnimRef.current)
      viewportAnimRef.current = null
    }
    const from = {
      pan: { ...panRef.current },
      zoom: zoomRef.current,
    }
    let started: number | null = null
    const step = (now: number) => {
      if (started == null) started = now
      const t = Math.min(1, (now - started) / CONTEXT_FOCUS_ANIM_MS)
      const eased = easeViewport(t)
      applyViewport({
        zoom: from.zoom + (to.zoom - from.zoom) * eased,
        pan: {
          x: from.pan.x + (to.pan.x - from.pan.x) * eased,
          y: from.pan.y + (to.pan.y - from.pan.y) * eased,
        },
      })
      if (t < 1) {
        viewportAnimRef.current = requestAnimationFrame(step)
        return
      }
      viewportAnimRef.current = null
    }
    viewportAnimRef.current = requestAnimationFrame(step)
  }

  function enterZoneIsolation(zone: VenueMapZone) {
    if (preview) return
    if (toolRef.current === "polygon") return
    abortTransientGestures()
    if (!activeZoneIdRef.current) {
      overviewViewportRef.current = {
        pan: { ...panRef.current },
        zoom: zoomRef.current,
      }
    }
    setIsolationId(null)
    setSeatEditMode(false)
    setActiveZoneId(zone.id)
    setSelection({ kind: "zone", id: zone.id })
    const box = zoneCanvasAabb(zone)
    if (!box) return
    animateViewport(
      fitViewportToWorldBox({
        box,
        viewBox: svgViewBoxRef.current,
      }),
    )
  }

  function exitZoneIsolation() {
    if (!activeZoneIdRef.current && !overviewViewportRef.current) return
    setActiveZoneId(null)
    const overview = overviewViewportRef.current
    overviewViewportRef.current = null
    if (overview) {
      animateViewport(overview)
      return
    }
    applyViewport({ pan: { x: 0, y: 0 }, zoom: 1 })
  }

  function withActiveZoneId<T extends { zoneId?: string }>(item: T): T {
    const zoneId = activeZoneIdRef.current
    if (!zoneId) return item
    return { ...item, zoneId }
  }

  function withActiveZoneIds<T extends { zoneId?: string }>(items: T[]): T[] {
    const zoneId = activeZoneIdRef.current
    if (!zoneId) return items
    return items.map((item) => ({ ...item, zoneId }))
  }

  function nudgeCanvasZoom(delta: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    const cursor = rect
      ? clientToViewBox(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : { x: CANVAS.width / 2, y: CANVAS.height / 2 }
    applyViewport(
      zoomTowardCursor({
        pan: panRef.current,
        zoom: zoomRef.current,
        nextZoom: clampVenueZoom(zoomRef.current + delta),
        cursor,
      }),
    )
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
        { id, text, x: 320, y: 100 + map.labels.length * 24, color: "#e4e4e7" },
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
    const points = polygonDraftRef.current
    if (points.length < 3) {
      toast.error("Trazá al menos 3 puntos para cerrar la zona.")
      return
    }
    const current = mapRef.current
    const created = createVenueZone(
      ensureZones(current).length,
      points.map(canvasPointToPercent),
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
    const created = withActiveZoneId(
      createVenueElement(
        nextPlacement.type,
        count,
        point,
        nextPlacement.subtype,
        activeZoneIdRef.current
          ? { zoneId: activeZoneIdRef.current }
          : undefined,
      ),
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

  function duplicateSelection(offset = 15) {
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
      .map((item) => cloneVenueElement(item, offset))
    commit({ ...current, elements: [...ensureElements(current), ...clones] })
    setSelection(
      clones.length === 1
        ? { kind: "element", id: clones[0]!.id }
        : { kind: "elements", ids: clones.map((item) => item.id) },
    )
  }

  function flipSelection(axis: "horizontal" | "vertical") {
    if (workModeRef.current === "pricing") return
    if (selectedElementIds.length === 0 || idsAreLocked(selectedElementIds)) return
    const current = mapRef.current
    commit({
      ...current,
      elements: flipSelectedElements(
        ensureElements(current),
        selectedElementIds,
        axis,
      ),
    })
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
    const selected = ensureElements(current).filter((item) => chosen.has(item.id))
    const bounds = selectionBounds(selected)
    const center = bounds
      ? boundsCenter(bounds)
      : { x: selected[0]!.x, y: selected[0]!.y }
    const rotated = rotateElementsAround(selected, center, delta)
    const byId = new Map(rotated.map((item) => [item.id, item]))
    commit({
      ...current,
      elements: ensureElements(current).map((item) => byId.get(item.id) ?? item),
    })
  }

  function applyGeneratedRing(elements: VenueMapElement[], replaceGroupId: string) {
    const current = mapRef.current
    const kept = ensureElements(current).filter(
      (item) => item.groupId !== replaceGroupId,
    )
    const next = {
      ...current,
      elements: [...kept, ...withActiveZoneIds(elements)],
    }
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
    const numbered = withActiveZoneIds(
      applyMatrixNumbering(
        created,
        created.map((item) => item.id),
        { rowAxis: "letters", aisleMode: "sequential" },
      ),
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
    if (selectedElementIds.length < 2 || idsAreLocked(selectedElementIds)) return
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

  function removeSeatsByKeys(keys: Set<string>) {
    if (keys.size === 0) return
    const current = mapRef.current
    commit({
      ...current,
      sectors: current.sectors
        .map((sector) => ({
          ...sector,
          seats: sector.seats.filter(
            (seat) => !keys.has(seatKey(sector.id, seat.id)),
          ),
        }))
        .filter((sector) => sector.seats.length > 0),
      elements: ensureElements(current)
        .map((item) => ({
          ...item,
          seats: item.seats.filter(
            (seat) => !keys.has(elementSeatKey(item.id, seat.id)),
          ),
        }))
        .filter((item) => item.type !== "vip_chair" || item.seats.length > 0),
    })
  }

  function deleteSelection() {
    const currentSelection = selectionRef.current
    const current = mapRef.current
    if (!currentSelection) {
      const fallbackIds = selectedElementIdsRef.current
      if (fallbackIds.length === 0) return
      const ids = new Set(fallbackIds)
      commit({
        ...current,
        elements: ensureElements(current).filter((item) => !ids.has(item.id)),
      })
      setIsolationId(null)
      setSelection(null)
      return
    }
    if (currentSelection.kind === "stage") {
      commit({ ...current, stage: null })
    } else if (currentSelection.kind === "sector") {
      commit({
        ...current,
        sectors: current.sectors.filter(
          (sector) => sector.id !== currentSelection.id,
        ),
      })
    } else if (currentSelection.kind === "label") {
      commit({
        ...current,
        labels: current.labels.filter((label) => label.id !== currentSelection.id),
      })
    } else if (currentSelection.kind === "aisle") {
      commit({
        ...current,
        aisles: current.aisles.filter((aisle) => aisle.id !== currentSelection.id),
      })
    } else if (currentSelection.kind === "element") {
      commit({
        ...current,
        elements: ensureElements(current).filter(
          (item) => item.id !== currentSelection.id,
        ),
      })
    } else if (currentSelection.kind === "elements") {
      const ids = new Set(currentSelection.ids)
      commit({
        ...current,
        elements: ensureElements(current).filter((item) => !ids.has(item.id)),
      })
    } else if (currentSelection.kind === "seats") {
      removeSeatsByKeys(new Set(currentSelection.ids))
      setIsolationId(null)
      setSeatEditMode(false)
      setSelection(null)
      return
    } else if (currentSelection.kind === "zone") {
      commit({
        ...current,
        zones: ensureZones(current).filter(
          (zone) => zone.id !== currentSelection.id,
        ),
      })
    }
    setIsolationId(null)
    setSelection(null)
  }

  function openObjectMenu(event: React.MouseEvent, target: ContextTarget) {
    event.preventDefault()
    event.stopPropagation()
    if (target.kind !== "element" || target.id !== isolationIdRef.current) {
      setIsolationId(null)
    }
    setSelection(target)
    setContextMenu({ x: event.clientX, y: event.clientY, target })
  }

  function focusProperties() {
    if (compactChrome) {
      openMobilePropertiesSheet()
      return
    }
    propertiesRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  function nudgeSelection(dx: number, dy: number) {
    if (workModeRef.current === "pricing") return
    if (!selection) return
    if (idsAreLocked(selectedElementIds)) return
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
    patchSelectedSeats({ status: "available" })
  }

  function elementSeatKey(elementId: string, seatId: string) {
    return `${elementId}::${seatId}`
  }

  function parseSeatSelectionKey(key: string) {
    const splitAt = key.indexOf("::")
    if (splitAt < 0) return { ownerId: "", seatId: key }
    return { ownerId: key.slice(0, splitAt), seatId: key.slice(splitAt + 2) }
  }

  function enterSeatEdit(ids: string[]) {
    setSeatEditMode(true)
    setSelection({ kind: "seats", ids })
    requestMobileProperties()
  }

  function beginSeatEditFromPointer(ids: string[], shiftKey: boolean) {
    elementDrag.current = null
    setIsPanning(false)
    cancelLiveTransform()
    const current = selectionRef.current
    const nextIds =
      shiftKey && current?.kind === "seats"
        ? [...new Set([...current.ids, ...ids])]
        : ids
    enterSeatEdit(nextIds)
  }

  function beginElementSeatEdit(
    element: VenueMapElement,
    seatId?: string,
    shiftKey = false,
  ) {
    if (workModeRef.current === "pricing") return false
    const seat = seatId
      ? element.seats.find((item) => item.id === seatId)
      : element.seats[0]
    if (!seat) return false
    enterIsolation(element.id)
    beginSeatEditFromPointer(
      [elementSeatKey(element.id, seat.id)],
      shiftKey,
    )
    return true
  }

  function onMapElementDoubleClick(
    event: React.MouseEvent,
    element: VenueMapElement,
  ) {
    if (workModeRef.current === "pricing") return
    isolateCanvasPointer(event)
    event.preventDefault()
    if (beginElementSeatEdit(element)) return
    if (element.groupId?.trim() && isolationId !== element.id) {
      enterIsolation(element.id)
    }
  }

  function onMapSeatDoubleClick(
    event: React.MouseEvent,
    element: VenueMapElement,
    seatId: string,
  ) {
    isolateCanvasPointer(event)
    event.preventDefault()
    beginElementSeatEdit(element, seatId, event.shiftKey)
  }

  function convertSelectionToIndividualSeats() {
    if (workModeRef.current === "pricing") return
    const current = mapRef.current
    const activeSelection = selectionRef.current
    if (activeSelection?.kind === "sector") {
      const sector = current.sectors.find(
        (item) => item.id === activeSelection.id,
      )
      if (!sector || sector.seats.length === 0) return
      const chairs = explodeVenueSectorToChairs(sector)
      commit({
        ...current,
        sectors: current.sectors.filter((item) => item.id !== sector.id),
        elements: [...ensureElements(current), ...chairs],
      })
      const keys = chairs.flatMap((chair) =>
        chair.seats.map((seat) => elementSeatKey(chair.id, seat.id)),
      )
      if (keys.length > 0) enterSeatEdit(keys)
      return
    }
    if (selectedElementIds.length === 0) return
    ungroupSelection()
    const items = ensureElements(mapRef.current).filter((item) =>
      selectedElementIds.includes(item.id),
    )
    const keys = items.flatMap((item) =>
      item.seats.map((seat) => elementSeatKey(item.id, seat.id)),
    )
    if (keys.length > 0) enterSeatEdit(keys)
  }

  function onMapSeatPointerDown(
    event: React.PointerEvent,
    element: VenueMapElement,
    seatId: string,
  ) {
    blurCanvasTypingTarget()
    if (wantsCanvasPan(event)) return
    isolateCanvasPointer(event, { preventGhostClick: true })
    if (event.button !== 0) return
    const key = elementSeatKey(element.id, seatId)
    if (event.detail >= 2 || seatEditModeRef.current || event.shiftKey) {
      enterIsolation(element.id)
      beginSeatEditFromPointer([key], event.shiftKey)
      return
    }
    enterIsolation(element.id)
    applyElementIds([element.id], { isolate: true })
    requestMobileProperties()
  }

  function patchSeatsByKeys(
    keys: Set<string>,
    patch: {
      status?: "available" | "blocked" | "reserved"
      number?: number
      x?: number
      y?: number
      rotation?: number
      price?: number
      label?: string
      row?: string
    },
  ) {
    if (keys.size === 0) return
    const current = mapRef.current
    commit({
      ...current,
      sectors: current.sectors.map((sector) => ({
        ...sector,
        seats: sector.seats.map((seat) =>
          keys.has(seatKey(sector.id, seat.id)) ? { ...seat, ...patch } : seat,
        ),
      })),
      elements: ensureElements(current).map((item) => ({
        ...item,
        seats: item.seats.map((seat) =>
          keys.has(elementSeatKey(item.id, seat.id))
            ? { ...seat, ...patch }
            : seat,
        ),
      })),
    })
  }

  function patchSelectedSeats(patch: {
    status?: "available" | "blocked" | "reserved"
    number?: number
    x?: number
    y?: number
    rotation?: number
    price?: number
    label?: string
    row?: string
  }) {
    if (selection?.kind === "seats") {
      patchSeatsByKeys(new Set(selection.ids), patch)
      return
    }
    if (selection?.kind === "sector") {
      patchSeatsByKeys(
        new Set(selectedSeatEntries.map((item) => item.key)),
        patch,
      )
    }
  }

  function applyManualSeatIdentity(next: {
    label?: string
    row?: string
    number?: string
  }) {
    if (!singleSeat) return
    const current = parseManualSeatFields({
      label: next.label ?? singleSeat.seat.label ?? "",
      row:
        next.row ??
        ("row" in singleSeat.seat ? singleSeat.seat.row : undefined),
      number: next.number ?? singleSeat.seat.number,
    })
    const parsedNumber = parseSeatNumberInput(current.number)
    patchSelectedSeats({
      label: current.label,
      ...(current.row ? { row: current.row } : {}),
      ...(parsedNumber != null ? { number: parsedNumber } : {}),
    })
  }

  function applyManualElementIdentity(next: {
    label?: string
    row?: string
    number?: string
  }) {
    if (!selectedElement) return
    const firstSeat = selectedElement.seats[0]
    const current = parseManualSeatFields({
      label: next.label ?? selectedElement.label,
      row: next.row ?? firstSeat?.row,
      number: next.number ?? firstSeat?.number,
    })
    const parsedNumber = parseSeatNumberInput(current.number)
    patchElement(selectedElement.id, {
      label: current.label,
      labelLocked: true,
      seats: selectedElement.seats.map((seat, index) =>
        index === 0
          ? {
              ...seat,
              label: current.label,
              ...(parsedNumber != null ? { number: parsedNumber } : {}),
              ...(current.row ? { row: current.row } : {}),
            }
          : seat,
      ),
    })
  }

  function applyOrientation(deg: number) {
    const rotation = normalizeDeg(deg)
    if (seatGizmoActive) {
      patchSeatsByKeys(
        new Set(selectedSeatEntries.map((item) => item.key)),
        { rotation },
      )
      return
    }
    if (selectedElementIds.length === 0) return
    const selected = new Set(selectedElementIds)
    const current = mapRef.current
    commit({
      ...current,
      elements: ensureElements(current).map((item) => {
        if (!selected.has(item.id)) return item
        const next = { ...item, rotation }
        if (!isInfrastructureElement(next)) {
          next.seats = rebuildElementSeats(next)
        }
        return next
      }),
    })
  }

  function beginElementDrag(
    kind: "stage" | "label" | "aisle" | "sector" | "element",
    event: React.PointerEvent,
    origX: number,
    origY: number,
    id?: string,
  ) {
    blurCanvasTypingTarget()
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
    blurCanvasTypingTarget()
    if (preview) return
    if (wantsCanvasPan(event)) return
    isolateCanvasPointer(event, { preventGhostClick: true })
    if (event.button !== 0) return
    if (event.detail >= 2) {
      cancelLiveTransform()
      enterZoneIsolation(zone)
      return
    }
    setIsolationId(null)
    setSelection({ kind: "zone", id: zone.id })
    requestMobileProperties()
    if (lassoModeRef.current) return
    if (
      activeZoneIdRef.current &&
      activeZoneIdRef.current !== zone.id
    ) {
      return
    }
    if (workModeRef.current !== "pricing") {
      beginGroupMove([], event, zone.id)
    }
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (preview) return
    blurCanvasTypingTarget()
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
      if (!event.shiftKey && !shouldBlockCanvasDeselect()) {
        setIsolationId(null)
        setSelection(null)
      }
      return
    }
    capturePointer(event)
    drag.current = { x: point.x, y: point.y }
    marqueeAdditive.current = event.shiftKey
    const seed = { x: point.x, y: point.y, w: 0, h: 0 }
    marqueeRef.current = seed
    setMarquee(seed)
    if (!event.shiftKey) {
      setIsolationId(null)
      setSelection(null)
    }
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
      paintLive({
        type: "rotate",
        cx: transforming.cx,
        cy: transforming.cy,
        deg: rotationDeltaFromPointer(
          { x: transforming.cx, y: transforming.cy },
          transforming.startAngle,
          point,
          snapActive(sample.shiftKey),
        ),
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
      const dragged = Boolean(live && !isIdentityLive(live))
      commitLiveTransform(snapActive(shiftKey))
      drag.current = null
      elementDrag.current = null
      setIsPanning(false)
      marqueeRef.current = null
      setMarquee(null)
      if (
        compactChromeRef.current &&
        !lassoModeRef.current &&
        !dragged &&
        (wasTap || pendingMobileProperties.current)
      ) {
        flushMobileProperties()
      } else {
        pendingMobileProperties.current = false
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
    const dragged = Boolean(legacyDrag?.recorded)
    if (
      compactChromeRef.current &&
      !dragged &&
      (legacyTap || selectedFromMarquee || pendingMobileProperties.current)
    ) {
      flushMobileProperties()
    } else {
      pendingMobileProperties.current = false
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
    if (!drag.current) return
    const pending = pendingMobileProperties.current
    finishPointerGesture(event.shiftKey)
    pendingMobileProperties.current = pending
  }

  const selectedSeatCount = selection?.kind === "seats" ? selection.ids.length : 0
  const selectedRawSeatIds = useMemo(() => {
    if (selection?.kind !== "seats") return []
    return selection.ids.map((key) => parseSeatSelectionKey(key).seatId)
  }, [selection])
  const singleSeat =
    selection?.kind === "seats" && selection.ids.length === 1
      ? (() => {
          const { ownerId, seatId } = parseSeatSelectionKey(selection.ids[0]!)
          const sector = map.sectors.find((item) => item.id === ownerId)
          const sectorSeat = sector?.seats.find((item) => item.id === seatId)
          if (sector && sectorSeat) {
            return { source: "sector" as const, sector, seat: sectorSeat }
          }
          const element = (map.elements ?? []).find((item) => item.id === ownerId)
          const elementSeat = element?.seats.find((item) => item.id === seatId)
          if (element && elementSeat) {
            return { source: "element" as const, element, seat: elementSeat }
          }
          return null
        })()
      : null
  const capacity = useMemo(() => venueMapCapacity(map), [map])
  const canUndo = undoCount > 0
  const canRedo = redoCount > 0
  const isWorkspace = variant === "workspace"
  const isStudio = variant === "studio" || isWorkspace
  const canConvertToIndividualSeats =
    Boolean(selectedSector && selectedSector.seats.length > 0) ||
    Boolean(selectedElement?.groupId?.trim()) ||
    (selection?.kind === "elements" &&
      selectionHasGroup(selectedElements, selectedElementIds))
  const inspectorHeadline = (() => {
    if (workMode === "pricing") {
      return { title: "Tarifas", detail: "Precio y color en el panel. El mapa no se mueve." }
    }
    if (workMode === "indexing") {
      return {
        title: "Indexación",
        detail: "Numeración de filas y asientos del bloque seleccionado.",
      }
    }
    if (selection?.kind === "seats") {
      if (singleSeat) {
        const title =
          singleSeat.seat.label ??
          (singleSeat.source === "sector"
            ? `${singleSeat.sector.name} - Fila ${singleSeat.seat.row}, Asiento ${singleSeat.seat.number}`
            : `${singleSeat.element.label} - Asiento ${singleSeat.seat.number}`)
        return { title, detail: "Butaca" }
      }
      return {
        title: `Selección: ${selectedSeatCount} Butacas`,
        detail: "Precio, estado y rotación se aplican a toda la selección.",
      }
    }
    if (selectedElementIds.length > 1) {
      const allChairs = selectedElements.every((item) => item.type === "vip_chair")
      return {
        title: allChairs
          ? `Selección: ${selectedElementIds.length} Butacas`
          : `Selección: ${selectedElementIds.length} elementos`,
        detail: "Edición masiva del grupo.",
      }
    }
    if (selectedElement) {
      return {
        title: selectedElement.label || selectedElement.sectorName || "Elemento",
        detail: selectedElement.sectorName || elementKindLabel(selectedElement.type),
      }
    }
    if (selectedSector) {
      return {
        title: selectedSector.name,
        detail: `Grada · ${selectedSector.seats.length} butacas`,
      }
    }
    if (selectedZone) {
      return { title: selectedZone.name, detail: "Zona" }
    }
    if (selection?.kind === "stage") {
      return { title: map.stage?.label || "Escenario", detail: "Escenario" }
    }
    if (selection?.kind === "label") {
      const text = map.labels.find((item) => item.id === selection.id)?.text
      return { title: text || "Etiqueta", detail: "Texto de nivel" }
    }
    return {
      title: "Predio",
      detail: "Foto aérea y medidas del recinto.",
    }
  })()
  const orientationState = (() => {
    if (workMode !== "architecture") return null
    if (seatGizmoActive && selectedSeatEntries.length > 0) {
      if (singleSeat) {
        return { value: singleSeat.seat.rotation ?? 0, mixed: false }
      }
      const rotations =
        selection?.kind === "seats"
          ? selection.ids.flatMap((key) => {
              const { ownerId, seatId } = parseSeatSelectionKey(key)
              const sectorSeat = map.sectors
                .find((item) => item.id === ownerId)
                ?.seats.find((item) => item.id === seatId)
              if (sectorSeat) return [sectorSeat.rotation ?? 0]
              const elementSeat = (map.elements ?? [])
                .find((item) => item.id === ownerId)
                ?.seats.find((item) => item.id === seatId)
              return elementSeat ? [elementSeat.rotation ?? 0] : []
            })
          : (selectedSector?.seats.map((seat) => seat.rotation ?? 0) ?? [])
      const first = rotations[0] ?? 0
      return {
        value: first,
        mixed: rotations.some((value) => Math.round(value) !== Math.round(first)),
      }
    }
    if (selectedElements.length > 0) {
      const first = selectedElements[0]!.rotation
      return {
        value: first,
        mixed: selectedElements.some(
          (item) => Math.round(item.rotation) !== Math.round(first),
        ),
      }
    }
    return null
  })()

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const node =
        target instanceof HTMLElement
          ? target
          : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null
      if (!node) return false
      if (node.isContentEditable) return true
      const field = node.closest("input, textarea, select")
      if (!(field instanceof HTMLElement)) return false
      if (field.tagName === "TEXTAREA" || field.tagName === "SELECT") return true
      if (field.tagName !== "INPUT") return false
      const type = field.getAttribute("type")?.toLowerCase() ?? "text"
      return (
        type === "text" ||
        type === "search" ||
        type === "email" ||
        type === "tel" ||
        type === "url" ||
        type === "password" ||
        type === "number" ||
        type === ""
      )
    }

    function onKeyDown(event: KeyboardEvent) {
      if (preview) return
      const drawingPolygon =
        toolRef.current === "polygon" || polygonDraftRef.current.length > 0
      if (drawingPolygon && event.key === "Enter") {
        event.preventDefault()
        closePolygonDraft()
        return
      }
      if (drawingPolygon && event.key === "Escape") {
        event.preventDefault()
        cancelPolygonDraft()
        return
      }
      if (drawingPolygon && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault()
        setPolygonDraft((points) => {
          if (points.length <= 1) {
            queueMicrotask(() => cancelPolygonDraft())
            return []
          }
          return points.slice(0, -1)
        })
        return
      }
      if (isTypingTarget(event.target)) return
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
        if (toolRef.current === "polygon" || polygonDraftRef.current.length > 0) {
          event.preventDefault()
          cancelPolygonDraft()
          return
        }
        if (liveTransformRef.current || transformDrag.current) {
          event.preventDefault()
          cancelLiveTransform()
          return
        }
        const isolatedId = isolationIdRef.current
        if (isolatedId || seatEditModeRef.current) {
          event.preventDefault()
          const members = isolatedId
            ? elementGroupMembers(ensureElements(mapRef.current), isolatedId)
            : []
          setSeatEditMode(false)
          setIsolationId(null)
          if (members.length > 0) {
            applyElementIds(members.map((item) => item.id))
          } else {
            setSelection(null)
          }
          return
        }
        if (activeZoneIdRef.current) {
          event.preventDefault()
          exitZoneIsolation()
          return
        }
        if (selectionRef.current) {
          event.preventDefault()
          setSelection(null)
          setPlacement(null)
          setTool("select")
        }
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectionRef.current || selectedElementIdsRef.current.length > 0) {
          event.preventDefault()
          deleteSelection()
        }
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

    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
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

  useLayoutEffect(() => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return
    function syncViewBox() {
      const node = canvasRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      setSvgViewBox(
        expandViewBoxToContainer({
          containerWidth: rect.width,
          containerHeight: rect.height,
          worldWidth: CANVAS.width,
          worldHeight: CANVAS.height,
          padding: VENUE_VIEW_PADDING,
        }),
      )
    }
    syncViewBox()
    const observer = new ResizeObserver(syncViewBox)
    observer.observe(canvasEl)
    return () => observer.disconnect()
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
      setWorkMode("architecture")
      setPlacement(next)
      setTool("polygon")
      setPolygonDraft([])
      setPolygonCursor(null)
      setSelection(null)
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

  function pickFloatingTool(next: FloatingDrawTool) {
    if (next === "select") {
      setTool("select")
      setPlacement(null)
      return
    }
    if (next === "polygon") {
      pickPaletteItem({ kind: "zone_polygon" })
      return
    }
    if (next === "seat") {
      pickPaletteItem({ kind: "element", type: "vip_chair" })
      return
    }
    pickPaletteItem({ kind: "element", type: "round_table" })
  }

  function selectFromLayerTree(next: LayerTreeSelection) {
    setTool("select")
    setPlacement(null)
    setIsolationId(null)
    if (next.kind === "seats") {
      enterSeatEdit(next.ids)
      return
    }
    setSeatEditMode(false)
    setSelection(next)
  }

  const floatingTool: FloatingDrawTool =
    tool === "polygon"
      ? "polygon"
      : placement?.kind === "element" && placement.type === "vip_chair"
        ? "seat"
        : placement?.kind === "element" &&
            (placement.type === "round_table" || placement.type === "long_table")
          ? "table"
          : "select"

  const hasPropertiesTarget =
    Boolean(selection) || workMode === "pricing" || workMode === "indexing"
  const propertiesTargetKey =
    selection?.kind === "seats"
      ? selection.ids[0] ?? "seats"
      : selection?.kind === "elements"
        ? selection.ids[0] ?? "elements"
        : selection && "id" in selection && selection.id
          ? selection.id
          : "predio"
  const mobileSheetOpen = toolsOpen || propertiesOpen || modesOpen
  const showSelectionToolbar =
    selectedElementIds.length >= 1 &&
    !geometryLocked &&
    !transformingKind &&
    !preview &&
    tool === "select"
  const toolbarWorld =
    showSelectionToolbar && transformBounds
      ? {
          x: transformBounds.x + transformBounds.width / 2,
          y: transformBounds.y,
          bottom: transformBounds.y + transformBounds.height,
        }
      : null
  const toolbarTopCss = toolbarWorld
    ? { x: toolbarWorld.x * zoom + pan.x, y: toolbarWorld.y * zoom + pan.y }
    : null
  const toolbarPlacement =
    toolbarTopCss && toolbarTopCss.y < 52 ? "below" : "above"
  const toolbarCss =
    toolbarPlacement === "below" && toolbarWorld
      ? {
          x: toolbarWorld.x * zoom + pan.x,
          y: toolbarWorld.bottom * zoom + pan.y,
        }
      : toolbarTopCss

  const toolbar = (
    <div
      className={cn(
        "z-20 flex w-full items-center border-b border-border bg-card text-card-foreground",
        isStudio
          ? "min-h-14 shrink-0 flex-nowrap gap-2 overflow-x-auto px-2 py-1.5 hide-scrollbar"
          : "flex-wrap gap-2 overflow-hidden px-3 py-2",
      )}
    >
      {isStudio && onClose ? (
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
      <VenueAutosaveBadge status={saveBadgeStatus} />

      <div
        data-slot="button-group"
        className={cn(
          "inline-flex min-w-0 items-center rounded-lg border border-zinc-800 bg-zinc-950 p-0.5",
          isStudio && "scrollbar-none overflow-x-auto",
          !isStudio && "flex-wrap gap-1 border-0 bg-transparent p-0",
          compactChrome && "hidden",
        )}
      >
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
            <ToolButton active={false} onClick={() => duplicateSelection()} label="Duplicar">
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
            disabled={mapBusy}
            onClick={() => {
              void persistEditorMap()
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

  const workspaceHeader = (
    <header className="z-30 flex h-14 shrink-0 items-center overflow-hidden border-b border-border bg-card px-3 text-card-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-3">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden lg:inline">{backLabel}</span>
          </Link>
        ) : onClose ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="h-8 shrink-0 px-1.5 text-xs text-muted-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden lg:inline">{backLabel}</span>
          </Button>
        ) : null}
        <Input
          value={eventTitle}
          readOnly={!onEventTitleChange}
          onChange={(event) => onEventTitleChange?.(event.target.value)}
          aria-label="Nombre del evento"
          className="h-8 min-w-0 max-w-[12rem] truncate border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none focus-visible:border-border"
        />
        <VenueAutosaveBadge status={saveBadgeStatus} />
      </div>
      <div className="flex shrink-0 justify-center px-2">
        <VenueWorkModeTabs
          layout="stepper"
          value={workMode}
          onChange={setStudioWorkMode}
        />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 pl-3">
        <Button
          type="button"
          variant="ghost"
          className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setLibraryOpen(true)}
        >
          Plantillas
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleClearMap}
        >
          Limpiar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 shrink-0 px-2.5 text-xs"
          onClick={openPreview}
        >
          Vista Previa
        </Button>
        {onSave ? (
          <Button
            type="button"
            disabled={mapBusy}
            onClick={() => {
              void persistEditorMap()
            }}
            className="h-8 shrink-0 bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Guardar Cambios
          </Button>
        ) : null}
      </div>
    </header>
  )

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-background text-foreground",
        isWorkspace
          ? "flex h-full min-h-0 w-full flex-col overflow-hidden"
          : isStudio
            ? "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
            : "rounded-2xl border border-border",
      )}
      data-field="venue.venueMap"
    >
      {isWorkspace && !compactChrome ? workspaceHeader : toolbar}

      <div
        className={cn(
          isStudio || compactChrome
            ? "flex min-h-0 flex-1 overflow-hidden"
            : "grid lg:grid-cols-[220px_1fr_280px]",
        )}
      >
        {(workMode === "architecture" || isWorkspace || isStudio) &&
        !compactChrome ? (
          <VenueLayerTree
            map={map}
            selection={selection}
            onSelect={selectFromLayerTree}
            collapsed={isStudio ? paletteCollapsed : false}
            onCollapsedChange={isStudio ? setPaletteCollapsed : undefined}
            activeZoneId={activeZoneId}
            className={cn(isStudio ? "w-72" : "w-full", isWorkspace && "h-full")}
          />
        ) : null}
        <div
          ref={canvasRef}
          className={cn(
            "relative overflow-hidden touch-none overscroll-none select-none bg-slate-100 bg-[radial-gradient(circle_at_1px_1px,#cbd5e1_1px,transparent_0)] bg-[size:20px_20px] dark:bg-zinc-950 dark:bg-[radial-gradient(circle_at_1px_1px,#27272a_1px,transparent_0)]",
            "relative min-h-0 flex-1 overflow-hidden",
            isStudio && "h-full w-full",
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
            viewBox={`${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.width} ${svgViewBox.height}`}
            preserveAspectRatio="xMidYMid meet"
            className={cn(
              "w-full touch-none select-none",
              "absolute inset-0 h-full min-h-0",
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
              <rect
                x={svgViewBox.x}
                y={svgViewBox.y}
                width={svgViewBox.width}
                height={svgViewBox.height}
                className="fill-slate-100 dark:fill-zinc-950"
              />
              <g className={isolationId && !activeZoneId ? "opacity-50" : undefined}>
              <g className={activeZoneId ? "opacity-30 grayscale" : undefined}>
              <VenueMapBackgroundLayer map={renderMap} />
              </g>
              <VenueMapZoneLayer
                zones={(renderMap.zones ?? []).filter(
                  (zone) => zone.id !== selectedZone?.id,
                )}
                selectedId={null}
                emphasizeSelected={false}
                focusedZoneId={activeZoneId}
                draft={polygonDraft}
                cursor={tool === "polygon" ? polygonCursor : null}
                onSelect={
                  tool === "polygon"
                    ? undefined
                    : (zone) => {
                        setIsolationId(null)
                        setSelection({ kind: "zone", id: zone.id })
                      }
                }
                onPointerDown={
                  tool === "polygon" ? undefined : onZonePointerDown
                }
                onDoubleClick={
                  tool === "polygon"
                    ? undefined
                    : (event, zone) => {
                        isolateCanvasPointer(event)
                        enterZoneIsolation(zone)
                      }
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
                    activeZoneId && "pointer-events-none opacity-30 grayscale",
                  )}
                  strokeWidth={1.5}
                  onContextMenu={(event) => openObjectMenu(event, { kind: "aisle", id: aisle.id })}
                  onPointerDown={(event) => {
                    if (activeZoneId) return
                    if (wantsCanvasPan(event)) return
                    event.stopPropagation()
                    if (event.button !== 0) return
                    setIsolationId(null)
                    setSelection({ kind: "aisle", id: aisle.id })
                    beginElementDrag("aisle", event, aisle.x, aisle.y, aisle.id)
                  }}
                />
              ))}
              {map.stage ? (
                <g
                  className={activeZoneId ? "pointer-events-none opacity-30 grayscale" : undefined}
                  onContextMenu={(event) => openObjectMenu(event, { kind: "stage" })}
                  onPointerDown={(event) => {
                    if (activeZoneId) return
                    if (wantsCanvasPan(event)) return
                    event.stopPropagation()
                    if (event.button !== 0) return
                    setIsolationId(null)
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
                      "fill-slate-200 dark:fill-zinc-800",
                      selection?.kind === "stage" && "stroke-emerald-400",
                    )}
                    strokeWidth={selection?.kind === "stage" ? 2 : 0}
                  />
                  <text
                    x={map.stage.x + map.stage.width / 2}
                    y={map.stage.y + map.stage.height / 2 + 5}
                    textAnchor="middle"
                    className="fill-slate-600 text-[13px] font-black tracking-[0.28em] dark:fill-[#e4e4e7]"
                  >
                    {map.stage.label}
                  </text>
                </g>
              ) : null}
              {renderMap.sectors.map((sector) => (
                <g key={sector.id}>
                  {sector.seats.map((seat) => {
                    const key = seatKey(sector.id, seat.id)
                    if (liveSeatKeys.has(key)) return null
                    const active =
                      (selection?.kind === "sector" && selection.id === sector.id) ||
                      (selection?.kind === "seats" && selection.ids.includes(key))
                    const outsideIsolation = activeZone
                      ? !seatBelongsToZone(
                          {
                            x: seat.x,
                            y: seat.y,
                            sectorId: sector.id,
                            sectorName: sector.name,
                          },
                          activeZone,
                        )
                      : false
                    return (
                      <g
                        key={seat.id}
                        className={
                          outsideIsolation
                            ? "pointer-events-none opacity-30 grayscale"
                            : undefined
                        }
                      >
                      <SectorSeatNode
                        sector={sector}
                        seat={seat}
                        selected={active}
                        zoom={zoom}
                        onContextMenu={(event) =>
                          openObjectMenu(event, { kind: "sector", id: sector.id })
                        }
                        onPointerDown={(event) => {
                          blurCanvasTypingTarget()
                          if (wantsCanvasPan(event)) return
                          isolateCanvasPointer(event, { preventGhostClick: true })
                          if (event.button !== 0) return
                          if (
                            event.detail >= 2 ||
                            seatEditModeRef.current ||
                            event.shiftKey
                          ) {
                            elementDrag.current = null
                            setIsPanning(false)
                            cancelLiveTransform()
                            const current = selectionRef.current
                            const nextIds =
                              event.shiftKey && current?.kind === "seats"
                                ? [...new Set([...current.ids, key])]
                                : [key]
                            enterSeatEdit(nextIds)
                            return
                          }
                          setIsolationId(null)
                          setSelection({ kind: "sector", id: sector.id })
                          requestMobileProperties()
                        }}
                        onDoubleClick={(event) => {
                          isolateCanvasPointer(event)
                          event.preventDefault()
                          beginSeatEditFromPointer([key], event.shiftKey)
                        }}
                        onClick={(event) => {
                          isolateCanvasPointer(event)
                          event.preventDefault()
                        }}
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
                isolationDimIds={isolationDimElementIds}
                onElementPointerDown={onMapElementPointerDown}
                onElementPointerEnter={onMapElementPointerEnter}
                onElementPointerLeave={onMapElementPointerLeave}
                onElementContextMenu={(event, element) =>
                  openObjectMenu(event, { kind: "element", id: element.id })
                }
                onSeatPointerDown={onMapSeatPointerDown}
                onElementDoubleClick={onMapElementDoubleClick}
                onSeatDoubleClick={onMapSeatDoubleClick}
                selectedSeatIds={selectedRawSeatIds}
              />
              </g>
              <g ref={liveGroupRef}>
                {renderMap.sectors.flatMap((sector) =>
                  sector.seats.flatMap((seat) => {
                    const key = seatKey(sector.id, seat.id)
                    if (!liveSeatKeys.has(key)) return []
                    const active =
                      (selection?.kind === "sector" && selection.id === sector.id) ||
                      (selection?.kind === "seats" && selection.ids.includes(key))
                    const outsideIsolation = activeZone
                      ? !seatBelongsToZone(
                          {
                            x: seat.x,
                            y: seat.y,
                            sectorId: sector.id,
                            sectorName: sector.name,
                          },
                          activeZone,
                        )
                      : false
                    return [
                      <g
                        key={key}
                        className={
                          outsideIsolation
                            ? "pointer-events-none opacity-30 grayscale"
                            : undefined
                        }
                      >
                      <SectorSeatNode
                        sector={sector}
                        seat={seat}
                        selected={active}
                        zoom={zoom}
                        onContextMenu={(event) =>
                          openObjectMenu(event, { kind: "sector", id: sector.id })
                        }
                        onPointerDown={(event) => {
                          blurCanvasTypingTarget()
                          if (wantsCanvasPan(event)) return
                          isolateCanvasPointer(event, { preventGhostClick: true })
                          if (event.button !== 0) return
                          if (
                            event.detail >= 2 ||
                            seatEditModeRef.current ||
                            event.shiftKey
                          ) {
                            elementDrag.current = null
                            setIsPanning(false)
                            cancelLiveTransform()
                            const current = selectionRef.current
                            const nextIds =
                              event.shiftKey && current?.kind === "seats"
                                ? [...new Set([...current.ids, key])]
                                : [key]
                            enterSeatEdit(nextIds)
                            return
                          }
                          setIsolationId(null)
                          setSelection({ kind: "sector", id: sector.id })
                          requestMobileProperties()
                        }}
                        onDoubleClick={(event) => {
                          isolateCanvasPointer(event)
                          event.preventDefault()
                          beginSeatEditFromPointer([key], event.shiftKey)
                        }}
                        onClick={(event) => {
                          isolateCanvasPointer(event)
                          event.preventDefault()
                        }}
                      />
                      </g>,
                    ]
                  }),
                )}
                {selectedZone ? (
                  <VenueMapZoneLayer
                    zones={[
                      (renderMap.zones ?? []).find(
                        (zone) => zone.id === selectedZone.id,
                      ) ?? selectedZone,
                    ]}
                    selectedId={selectedZone.id}
                    emphasizeSelected={false}
                    focusedZoneId={activeZoneId}
                    onSelect={
                      tool === "polygon"
                        ? undefined
                        : (zone) => {
                            setIsolationId(null)
                            setSelection({ kind: "zone", id: zone.id })
                          }
                    }
                    onPointerDown={
                      tool === "polygon"
                        ? undefined
                        : (event, zone) => {
                            setIsolationId(null)
                            onZonePointerDown(event, zone)
                          }
                    }
                    onDoubleClick={
                      tool === "polygon"
                        ? undefined
                        : (event, zone) => {
                            isolateCanvasPointer(event)
                            enterZoneIsolation(zone)
                          }
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
                    isolationDimIds={isolationDimElementIds}
                    onElementPointerDown={onMapElementPointerDown}
                    onElementPointerEnter={onMapElementPointerEnter}
                    onElementPointerLeave={onMapElementPointerLeave}
                    onElementContextMenu={(event, element) =>
                      openObjectMenu(event, { kind: "element", id: element.id })
                    }
                    onSeatPointerDown={onMapSeatPointerDown}
                    onElementDoubleClick={onMapElementDoubleClick}
                    onSeatDoubleClick={onMapSeatDoubleClick}
                    selectedSeatIds={selectedRawSeatIds}
                  />
                </g>
                {transformBounds && !geometryLocked ? (
                  <SvgTransformBox
                    bounds={transformBounds}
                    zoom={zoom}
                    grabbing={transformingKind === "move"}
                    isRotating={transformingKind === "rotate"}
                    fatFinger={compactChrome}
                    locked={selectionLocked}
                    hideResize={seatGizmoActive}
                    onMoveStart={(event) => {
                      if (selectedZone) {
                        beginGroupMove([], event, selectedZone.id)
                        return
                      }
                      if (seatGizmoActive) {
                        beginGroupMove([], event)
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
              {hoverGroupBounds ? (
                <rect
                  x={hoverGroupBounds.x}
                  y={hoverGroupBounds.y}
                  width={hoverGroupBounds.width}
                  height={hoverGroupBounds.height}
                  fill="none"
                  stroke="#d4d4d8"
                  strokeDasharray={`${4 / Math.max(0.25, zoom)} ${3 / Math.max(0.25, zoom)}`}
                  strokeWidth={1 / Math.max(0.25, zoom)}
                  pointerEvents="none"
                />
              ) : null}
              <g className={isolationId && !activeZoneId ? "opacity-50" : undefined}>
              {map.labels.map((label) => (
                <text
                  key={label.id}
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fill={canvasLabelFill(label.color)}
                  className={cn(
                    "cursor-pointer text-[15px] font-black tracking-[0.22em]",
                    activeZoneId && "pointer-events-none opacity-30 grayscale",
                  )}
                  onContextMenu={(event) => openObjectMenu(event, { kind: "label", id: label.id })}
                  onPointerDown={(event) => {
                    if (activeZoneId) return
                    if (wantsCanvasPan(event)) return
                    event.stopPropagation()
                    if (event.button !== 0) return
                    setIsolationId(null)
                    setSelection({ kind: "label", id: label.id })
                    beginElementDrag("label", event, label.x, label.y, label.id)
                  }}
                >
                  {label.text}
                </text>
              ))}
              </g>
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
          {activeZoneId && !preview ? (
            <button
              type="button"
              onClick={exitZoneIsolation}
              className="absolute top-4 left-4 z-40 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-zinc-800"
            >
              Volver al mapa general
            </button>
          ) : null}
          {!compactChrome && !preview ? (
            <VenueFloatingToolbar
              active={floatingTool}
              onChange={pickFloatingTool}
              onPlace={pickPaletteItem}
            />
          ) : null}
          {isStudio && tool !== "polygon" ? (
            <VenueStudioHud
              map={map}
              className={compactChrome ? "top-3 bottom-auto" : undefined}
              zoomPercent={Math.round(zoom * 100)}
              onZoomIn={() => nudgeCanvasZoom(0.1)}
              onZoomOut={() => nudgeCanvasZoom(-0.1)}
              onZoomReset={() => applyViewport({ pan: { x: 0, y: 0 }, zoom: 1 })}
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
          !selectionLocked &&
          !mobileSheetOpen ? (
            <VenueNudgePad
              className="absolute right-3 z-40 bottom-[5.5rem]"
              onNudge={nudgeSelection}
            />
          ) : null}
          {showSelectionToolbar && toolbarCss ? (
            <VenueSelectionToolbar
              x={toolbarCss.x}
              y={toolbarCss.y}
              placement={toolbarPlacement}
              locked={selectionLocked}
              fullyLocked={selectionFullyLocked}
              canGroup={selectedElementIds.length > 1}
              canUngroup={selectionHasGroup(
                selectedElements,
                selectedElementIds,
              )}
              canAlign={canTidyUp}
              onToggleLock={toggleSelectionLock}
              onGroup={groupSelection}
              onUngroup={ungroupSelection}
              onAlignCenter={tidyAlignCenter}
              onDistributeHorizontal={tidyDistributeHorizontal}
              onFlipHorizontal={() => flipSelection("horizontal")}
              onFlipVertical={() => flipSelection("vertical")}
              onDuplicate={() => duplicateSelection(20)}
            />
          ) : null}
        </div>

        <StudioInspectorFrame
          isStudio={isStudio}
          isDesktop={isDesktop}
          open={propertiesOpen}
          onOpenChange={handlePropertiesOpenChange}
          selectionKey={propertiesTargetKey}
          propertiesRef={propertiesRef}
          collapsed={isStudio && !compactChrome ? inspectorCollapsed : false}
          onCollapsedChange={
            isStudio && !compactChrome ? setInspectorCollapsed : undefined
          }
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
                {inspectorHeadline.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {inspectorHeadline.detail}
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
          {workMode === "architecture" && canConvertToIndividualSeats ? (
            <Button
              type="button"
              className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={convertSelectionToIndividualSeats}
            >
              Convertir a butacas individuales
            </Button>
          ) : null}
          {workMode === "pricing" ? (
            <VenueHeatmapPanel
              map={map}
              activeKey={activePriceGroup?.key}
              onSelectGroup={selectPriceGroup}
              onPatchGroup={patchPriceGroup}
            />
          ) : workMode === "indexing" ? (
            <div className="space-y-4">
              {singleSeat ? (
                <VenueManualEditPanel
                  label={singleSeat.seat.label ?? ""}
                  row={
                    "row" in singleSeat.seat
                      ? (singleSeat.seat.row ?? "")
                      : ""
                  }
                  number={String(singleSeat.seat.number)}
                  showRow
                  showNumber
                  onLabelChange={(value) =>
                    applyManualSeatIdentity({ label: value })
                  }
                  onRowChange={(value) => {
                    const number = String(singleSeat.seat.number)
                    applyManualSeatIdentity({
                      row: value,
                      label: composeManualSeatLabel({
                        row: value,
                        number,
                        fallbackLabel: singleSeat.seat.label ?? "",
                      }),
                    })
                  }}
                  onNumberChange={(value) => {
                    const row =
                      singleSeat.source === "sector"
                        ? singleSeat.seat.row
                        : (singleSeat.seat.row ?? "")
                    applyManualSeatIdentity({
                      number: value,
                      label: composeManualSeatLabel({
                        row,
                        number: value,
                        fallbackLabel: singleSeat.seat.label ?? "",
                      }),
                    })
                  }}
                />
              ) : selectedElement && selectedElementIds.length === 1 ? (
                <VenueManualEditPanel
                  label={selectedElement.label}
                  row={selectedElement.seats[0]?.row}
                  number={
                    selectedElement.seats[0]
                      ? String(selectedElement.seats[0].number)
                      : ""
                  }
                  showRow={
                    selectedElement.type === "vip_chair" ||
                    Boolean(selectedElement.seats[0]?.row)
                  }
                  showNumber={
                    selectedElement.type === "vip_chair" ||
                    selectedElement.seats.length === 1
                  }
                  onLabelChange={(value) =>
                    applyManualElementIdentity({ label: value })
                  }
                  onRowChange={(value) => {
                    const number = selectedElement.seats[0]
                      ? String(selectedElement.seats[0].number)
                      : ""
                    applyManualElementIdentity({
                      row: value,
                      label: composeManualSeatLabel({
                        row: value,
                        number,
                        fallbackLabel: selectedElement.label,
                      }),
                    })
                  }}
                  onNumberChange={(value) => {
                    applyManualElementIdentity({
                      number: value,
                      label: composeManualSeatLabel({
                        row: selectedElement.seats[0]?.row ?? "",
                        number: value,
                        fallbackLabel: selectedElement.label,
                      }),
                    })
                  }}
                />
              ) : (
                <AutoNumberingPanel
                  elements={ensureElements(map)}
                  selectedIds={selectedElementIds}
                  onApply={applySelectedElements}
                />
              )}
              {singleSeat ||
              (selectedElement && selectedElementIds.length === 1) ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Para numerar un bloque completo, deseleccioná esta pieza o
                  seleccioná varias.
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Clic en un bloque agrupado para numerarlo. Una sola butaca
                  abre la edición manual.
                </p>
              )}
            </div>
          ) : (
            <>
          {showRings ? (
            <ConcentricRingGenerator onGenerate={applyGeneratedRing} />
          ) : null}

          {orientationState ? (
            <OrientationControl
              value={orientationState.value}
              mixed={orientationState.mixed}
              onChange={applyOrientation}
            />
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
              <Button
                type="button"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={() => {
                  const first = selectedSector.seats[0]
                  enterSeatEdit(
                    first
                      ? [seatKey(selectedSector.id, first.id)]
                      : [],
                  )
                }}
              >
                Editar asientos individuales
              </Button>
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
              <AdvancedPositionSettings>
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
              </AdvancedPositionSettings>
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
              <Button type="button" variant="outline" onClick={() => duplicateSelection()}>
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
                <PriceField
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
              {selectedElement.seats.length > 0 && !selectedElement.groupId ? (
                <Button
                  type="button"
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={() => {
                    const first = selectedElement.seats[0]
                    enterIsolation(selectedElement.id)
                    enterSeatEdit(
                      first
                        ? [elementSeatKey(selectedElement.id, first.id)]
                        : [],
                    )
                  }}
                >
                  Editar asientos individuales
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
              <Button type="button" variant="outline" onClick={() => duplicateSelection()}>
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
              <Button type="button" variant="outline" onClick={() => duplicateSelection()}>
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
            <div className="space-y-4">
              {singleSeat ? (
                <>
                  <Field label="Identificador">
                    <Input
                      value={
                        singleSeat.seat.label ??
                        (singleSeat.source === "sector"
                          ? `Fila ${singleSeat.seat.row} - Asiento ${singleSeat.seat.number}`
                          : `${singleSeat.element.label} - Asiento ${singleSeat.seat.number}`)
                      }
                      onChange={(event) =>
                        patchSelectedSeats({ label: event.target.value })
                      }
                      aria-label="Identificador de ubicacion"
                      className="h-9"
                    />
                  </Field>
                  <Field label="Estado">
                    <SeatStatusControl
                      value={singleSeat.seat.status}
                      onChange={(status) => patchSelectedSeats({ status })}
                    />
                  </Field>
                  <Field label="Precio">
                    <PriceField
                      value={
                        singleSeat.seat.price ??
                        (singleSeat.source === "sector"
                          ? singleSeat.sector.price
                          : singleSeat.element.price)
                      }
                      onValueChange={(value) => {
                        if (value == null) return
                        patchSelectedSeats({ price: value })
                      }}
                    />
                  </Field>
                  <AdvancedPositionSettings>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Coordenada X">
                        <Input
                          type="number"
                          value={Math.round(singleSeat.seat.x)}
                          onChange={(event) =>
                            patchSelectedSeats({
                              x: Number(event.target.value) || 0,
                            })
                          }
                        />
                      </Field>
                      <Field label="Coordenada Y">
                        <Input
                          type="number"
                          value={Math.round(singleSeat.seat.y)}
                          onChange={(event) =>
                            patchSelectedSeats({
                              y: Number(event.target.value) || 0,
                            })
                          }
                        />
                      </Field>
                    </div>
                  </AdvancedPositionSettings>
                </>
              ) : (
                <div className="space-y-4">
                  <Field label="Estado">
                    <SeatStatusControl
                      onChange={(status) => patchSelectedSeats({ status })}
                    />
                  </Field>
                  <Field label="Precio">
                    <PriceField
                      value={undefined}
                      onValueChange={(value) => {
                        if (value == null) return
                        patchSelectedSeats({ price: value })
                      }}
                    />
                  </Field>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                onClick={() => patchSelectedSeats({ status: "blocked" })}
              >
                Inhabilitar
              </Button>
              <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={restoreSelectedSeats}>
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
                  <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
                    <p className="text-sm font-semibold text-foreground">
                      Encaje de la foto
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Ajustá la escala de la foto sobre el plano. Las medidas
                      técnicas del lienzo están en ajustes avanzados.
                    </p>
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
                    <AdvancedPositionSettings>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Ancho (px)">
                          <Input value={CANVAS.width} readOnly />
                        </Field>
                        <Field label="Alto (px)">
                          <Input value={CANVAS.height} readOnly />
                        </Field>
                      </div>
                    </AdvancedPositionSettings>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {selection ? (
            <Button
              type="button"
              className="w-full bg-red-600 text-white hover:bg-red-500"
              onClick={deleteSelection}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar selección
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
            <div className="absolute bottom-4 left-1/2 z-10 flex w-[calc(100%-1.5rem)] -translate-x-1/2 justify-center overflow-x-auto pb-[env(safe-area-inset-bottom)] hide-scrollbar">
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
                onProperties={() => openMobilePropertiesSheet()}
              />
            </div>
          ) : null}
          <Sheet open={toolsOpen} onOpenChange={setToolsOpen}>
            <SheetContent
              side="bottom"
              overlayClassName="bg-black/20"
              className="h-auto max-h-[min(48dvh,calc(100dvh-6rem))] gap-0 p-0"
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
              className="h-auto max-h-[min(48dvh,calc(100dvh-6rem))] gap-0 p-0"
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
  selectionKey = "predio",
  title = "Propiedades",
  description = "Editá nombre, precio y reglas del elemento seleccionado.",
  collapsed = false,
  onCollapsedChange,
  children,
}: {
  isStudio: boolean
  isDesktop: boolean
  open: boolean
  onOpenChange: (
    open: boolean,
    details?: { reason?: string; cancel?: () => void },
  ) => void
  propertiesRef: React.RefObject<HTMLElement | null>
  selectionKey?: string
  title?: string
  description?: string
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  children: React.ReactNode
}) {
  if (isDesktop && !isStudio) {
    return (
      <aside
        ref={propertiesRef}
        className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto border-t border-border bg-card p-4 text-card-foreground lg:border-t-0 lg:border-l"
      >
        {children}
      </aside>
    )
  }

  if (isDesktop) {
    return (
      <aside
        ref={propertiesRef}
        className={cn(
          "flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-card text-card-foreground",
          collapsed ? "w-12" : "w-80",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center border-b border-border",
            collapsed ? "justify-center py-2" : "justify-end px-2 py-1.5",
          )}
        >
          <button
            type="button"
            title={collapsed ? "Expandir inspector" : "Contraer inspector"}
            aria-label={collapsed ? "Expandir inspector" : "Contraer inspector"}
            onClick={() => onCollapsedChange?.(!collapsed)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {collapsed ? (
              <PanelRightOpen className="size-4" />
            ) : (
              <PanelRightClose className="size-4" />
            )}
          </button>
        </div>
        {collapsed ? null : children}
      </aside>
    )
  }

  return (
    <Sheet
      key="venue-mobile-properties"
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent
        side="bottom"
        overlayClassName="bg-black/50"
        initialFocus={false}
        finalFocus={false}
        className="h-auto max-h-[min(48dvh,calc(100dvh-6rem))] gap-0 border-border bg-card p-0 text-card-foreground"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" />
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div
          key={selectionKey}
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
      className={cn(
        "h-9 shrink-0 gap-1.5 border-zinc-700 bg-zinc-800/50 px-2 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-100 md:px-3",
        active && "border-zinc-600 bg-zinc-800 text-zinc-100 ring-1 ring-emerald-500/40",
      )}
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

function elementKindLabel(type: VenueMapElement["type"]) {
  if (type === "vip_chair") return "Butaca"
  if (type === "round_table") return "Mesa redonda"
  if (type === "long_table") return "Mesa rectangular"
  if (type === "vip_box") return "Box VIP"
  if (type === "standing_zone") return "Campo"
  return "Servicio"
}

function SectorSeatNode({
  sector,
  seat,
  selected,
  zoom,
  onContextMenu,
  onPointerDown,
  onDoubleClick,
  onClick,
}: {
  sector: VenueMapSector
  seat: VenueMapSeat
  selected: boolean
  zoom: number
  onContextMenu: (event: React.MouseEvent) => void
  onPointerDown: (event: React.PointerEvent) => void
  onDoubleClick: (event: React.MouseEvent) => void
  onClick: (event: React.MouseEvent) => void
}) {
  return (
    <g
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
    >
      <TheatreSeatSymbol
        cx={seat.x}
        cy={seat.y}
        width={12}
        height={12}
        rotation={seat.rotation ?? 0}
        color={seat.status === "blocked" ? "#3f3f46" : sector.color}
        selected={selected}
        occupied={seat.status === "blocked"}
        label={zoom >= 1.2 ? String(seat.number) : undefined}
        showLabel={zoom >= 1.2}
      />
    </g>
  )
}

function OrientationControl({
  value,
  mixed = false,
  onChange,
}: {
  value: number
  mixed?: boolean
  onChange: (deg: number) => void
}) {
  const current = Math.round(value)
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Orientación</Label>
      <div className="grid grid-cols-4 gap-1">
        {[0, 45, 90, 180].map((deg) => {
          const active = !mixed && current === deg
          return (
            <button
              key={deg}
              type="button"
              onClick={() => onChange(deg)}
              className={cn(
                "h-8 rounded-md border text-[11px] font-semibold",
                active
                  ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                  : "border-zinc-200 bg-background text-muted-foreground hover:bg-muted dark:border-zinc-800",
              )}
            >
              {deg}°
            </button>
          )
        })}
      </div>
      <Input
        type="number"
        min={0}
        max={359}
        value={mixed ? "" : current}
        placeholder={mixed ? "Varios" : undefined}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        aria-label="Rotación en grados"
      />
    </div>
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

function AdvancedPositionSettings({ children }: { children: React.ReactNode }) {
  return (
    <Accordion className="rounded-lg border border-border px-3">
      <AccordionItem value="position" className="border-0">
        <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
          Ajustes Avanzados de Posición
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pb-3">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function SeatStatusControl({
  value,
  onChange,
}: {
  value?: "available" | "blocked" | "reserved"
  onChange: (status: "available" | "blocked" | "reserved") => void
}) {
  const options = [
    { id: "available" as const, label: "Activo" },
    { id: "blocked" as const, label: "Inhabilitado" },
    { id: "reserved" as const, label: "Reservado" },
  ]
  return (
    <div className="grid grid-cols-3 gap-1">
      {options.map((option) => {
        const active = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "h-9 rounded-md border px-1 text-[11px] font-medium",
              active
                ? option.id === "blocked"
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                  : option.id === "reserved"
                    ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function PriceField({
  value,
  onValueChange,
}: {
  value: number | null | undefined
  onValueChange: (value: number | undefined) => void
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted-foreground">
        $ ARS
      </span>
      <PriceInput
        value={value}
        onValueChange={onValueChange}
        className="pl-14"
      />
    </div>
  )
}
