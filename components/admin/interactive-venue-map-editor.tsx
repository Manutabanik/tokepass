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
  ChevronDown,
  CircleDot,
  Copy,
  Eye,
  Info,
  LayoutTemplate,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Magnet,
  Redo2,
  Save,
  Square,
  Trash2,
  Undo2,
  Wand2,
  PenTool,
  Send,
} from "lucide-react"
import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ErrorInfo,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  VenueBulkEditPanel,
  VenueTicketTypeSelect,
} from "@/components/admin/venue-bulk-edit-panel"
import { GridArrayDialog } from "@/components/admin/grid-array-dialog"
import { LabelOverrideDialog } from "@/components/admin/label-override-dialog"
import { VenueHeatmapPanel } from "@/components/admin/venue-heatmap-panel"
import { VenueWorkModeTabs, type VenueWorkMode } from "@/components/admin/venue-work-mode-tabs"
import { AutoNumberingPanel } from "@/components/admin/auto-numbering-panel"
import { VenueManualEditPanel } from "@/components/admin/venue-manual-edit-panel"
import { BuyerViewModal } from "@/components/admin/buyer-view-modal"
import { ConcentricRingGenerator } from "@/components/admin/concentric-ring-generator"
import { VenueCanvasContextMenu } from "@/components/admin/venue-canvas-context-menu"
import { VenueComponentPalette, type PalettePlacement } from "@/components/admin/venue-component-palette"
import { VenueStudioSidebar } from "@/components/admin/venue-studio-sidebar"
import { VenueFloatingToolbar, type FloatingDrawTool } from "@/components/admin/venue-floating-toolbar"
import {
  VenueLayerTree,
  type LayerTreeSelection,
} from "@/components/admin/venue-layer-tree"
import { CanvasPropertiesInspector } from "@/components/admin/canvas-properties-inspector"
import { VenueMapBackgroundPanel } from "@/components/admin/venue-map-background-panel"
import { VenueParametricRulesPanel } from "@/components/admin/venue-parametric-rules-panel"
import { VenueRowsConfigEditor } from "@/components/admin/venue-rows-config-editor"
import { VenueSectorColorPicker } from "@/components/admin/venue-sector-color-field"
import { SvgTransformBox } from "@/components/admin/svg-transform-box"
import { VenueSelectionToolbar } from "@/components/admin/venue-selection-toolbar"
import { VenueMobileFabBar } from "@/components/admin/venue-mobile-fab-bar"
import { VenueNudgePad } from "@/components/admin/venue-nudge-pad"
import { InspectorShapeSelector } from "@/components/admin/inspector-shape-selector"
import {
  hidePolygonCursor,
  paintPolygonCursor,
  PolygonCursorOverlay,
} from "@/components/admin/polygon-cursor-overlay"
import {
  EMPTY_SEAT_KEYS,
  SEAT_LABEL_MIN_ZOOM,
  VenueSectorSeatLayer,
} from "@/components/admin/venue-sector-seat-layer"
import { TheatreSeatDefs } from "@/components/admin/venue-svg-symbols"
import { VenueStudioHud } from "@/components/admin/venue-studio-hud"
import { VenueTemplateLibrary } from "@/components/admin/venue-template-selector"
import {
  loadVenueMapEditorInventory,
  saveVenueMapOnly,
} from "@/app/actions/events"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useIsDesktop } from "@/hooks/use-media-query"
import {
  UNSAVED_MAP_CHANGES_MESSAGE,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes"
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
import { VenueMapBackgroundLayer } from "@/components/venue/venue-map-background-layer"
import { VenueMapElementLayer } from "@/components/venue/venue-map-element-layer"
import { VenueMapGridLayer } from "@/components/venue/venue-map-grid-layer"
import { VenueMapZoneLayer } from "@/components/venue/venue-map-zone-layer"
import {
  inventoryHitFromEvent,
  inventoryHitFromNode,
  type InventoryHit,
} from "@/lib/seating/inventory-hit"
import {
  applyLocalStockLocks,
  EDITOR_STOCK_LOCK_MESSAGE,
  elementHasCommittedStock,
  elementIdsHaveCommittedStock,
  layoutIdHasCommittedStock,
  seatKeysHaveCommittedStock,
} from "@/lib/seating/editor-stock-lock"
import { hydrateVenueMapOccupancy } from "@/lib/seating/map-inventory-hydration"
import type { VenueMapSeatingUnitRef } from "@/lib/seating/map-inventory-hydration"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
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
  shouldUndoPolygonDraft,
  takeVenueMapRedo,
  takeVenueMapUndo,
} from "@/lib/seating/venue-map-history"
import {
  applyBulkElementCapacity,
  applyBulkElementColor,
  applyBulkElementCustomLabel,
  applyBulkElementPrice,
  applyBulkElementTicketType,
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
  applyLiveToAisle,
  applyLiveToSeats,
  applyLiveToStage,
  applyMoveSnap,
  applyMoveSnapFromOrigin,
  applyRotateSnap,
  bakeLiveTransform,
  boundsCenter,
  rotationDeltaFromPointer,
  clampVenueZoom,
  elementAabb,
  expandViewBoxToContainer,
  fitViewportToWorldBox,
  flipSelectedElements,
  handlePoint,
  liveScaleAxes,
  liveTransformToSvg,
  clientPointToSvgUser,
  clientDeltaToViewBox,
  clientPointInContainer,
  svgUserToClient,
  viewBoxPointToWorld,
  normalizeDeg,
  pointsToBounds,
  rectAabb,
  resizeOrigin,
  rotateElementsAround,
  scaleFromHandlePointer,
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
  pruneVenueMapSelection,
} from "@/lib/seating/venue-map-selection"
import {
  createVenueZone,
} from "@/lib/seating/adaptive-seating"
import {
  polygonFromCanvas,
  isCloseToFirstVertex,
  popPolygonDraft,
  setPolygonVertexAtCanvas,
  transformPercentPolygon,
  translatePercentPolygon,
  VENUE_MAP_CANVAS,
} from "@/lib/seating/venue-polygon"
import {
  magneticSnapActive,
  snapPointToGrid,
} from "@/lib/seating/venue-grid-snap"
import {
  applyVenueMapBackgroundPatch,
  type VenueMapBackgroundPatch,
} from "@/lib/seating/venue-map-background"
import { fallbackWorldCenter } from "@/lib/seating/venue-viewport"
import {
  rebuildSectorSeats,
  venueMapCapacity,
  venueMapHasInventory,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import {
  resizeRowsConfig,
  resolveSectorRowsConfig,
  rowsConfigGridFields,
  resolveZoneRowsConfig,
} from "@/lib/seating/venue-rows-config"
import {
  distributeOnArc,
  generateGridArray,
} from "@/lib/seating/venue-array"
import {
  CONTEXT_FOCUS_ANIM_MS,
  elementBelongsToZone,
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
  type InteractiveVenueMap,
  type VenueMapAisle,
  type VenueMapElement,
  type VenueMapPoint,
  type VenueMapSector,
  type VenueMapStage,
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

type TransformTarget = "seats" | "stage" | "aisle"

type TransformDrag =
  | {
      mode: "move"
      ids: string[]
      zoneId?: string
      aisleId?: string
      target?: TransformTarget
      startX: number
      startY: number
      originX: number
      originY: number
    }
  | {
      mode: "scale"
      ids: string[]
      zoneId?: string
      aisleId?: string
      target?: TransformTarget
      ox: number
      oy: number
      startDist: number
      startCornerX: number
      startCornerY: number
      handle: ResizeHandle
    }
  | {
      mode: "rotate"
      ids: string[]
      zoneId?: string
      aisleId?: string
      target?: TransformTarget
      cx: number
      cy: number
      startAngle: number
    }

class VenueCanvasErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("venue-map-canvas-recovered", error.message, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-100/90 px-6 text-center dark:bg-zinc-950/90">
        <p className="text-sm font-medium text-foreground">
          Hubo un error al dibujar el mapa. Las herramientas siguen activas.
        </p>
        <button
          type="button"
          className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium"
          onClick={() => {
            this.props.onReset()
            this.setState({ failed: false })
          }}
        >
          Seguir dibujando
        </button>
      </div>
    )
  }
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
const POLYGON_CLOSE_DRAG_GUARD_MS = 400
const ZONE_COLORS = ["#f97316", "#ec4899", "#f59e0b", "#10b981", "#6366f1", "#06b6d4"]

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function seatKey(sectorId: string, seatId: string) {
  return `${sectorId}::${seatId}`
}

const EMPTY_ELEMENT_IDS: string[] = []

const STOCK_LOCKED_ELEMENT_PATCH_KEYS = [
  "ticketTypeId",
  "type",
  "zoneId",
  "groupId",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "chairCount",
  "sideA",
  "sideB",
  "sellMode",
] as const

function isEditorChromeTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      "[data-editor-chrome], [role='toolbar'], [data-slot='dropdown-menu-trigger'], [data-slot='dropdown-menu-content']",
    ),
  )
}

export function InteractiveVenueMapEditor({
  value,
  onChange,
  onSave,
  onClose,
  onPreview,
  saving = false,
  variant = "card",
  eventTitle = "Mapa del recinto",
  onEventTitleChange,
  backHref,
  backLabel = "Volver al evento",
  tickets,
  eventId,
}: {
  value?: InteractiveVenueMap | null
  onChange: (map: InteractiveVenueMap, seatingLayout: VenueSeatingLayout) => void
  onSave?: (map: InteractiveVenueMap) => void | Promise<void>
  onClose?: () => void
  onPreview?: () => void
  saving?: boolean
  variant?: "card" | "studio" | "workspace"
  eventTitle?: string
  onEventTitleChange?: (title: string) => void
  backHref?: string
  backLabel?: string
  tickets?: VenueMapSkuTicketRef[] | null
  eventId?: string | null
}) {
  const router = useRouter()
  const svgRef = useRef<SVGSVGElement>(null)
  const [map, setMap] = useState<InteractiveVenueMap>(
    parseVenueMap(value ?? emptyVenueMap()),
  )
  const [seatingUnits, setSeatingUnits] = useState<VenueMapSeatingUnitRef[]>([])
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null)
  const occupancyBySeatId = useMemo(
    () =>
      hydrateVenueMapOccupancy(map, {
        seatingUnits,
        lockUnknownLayoutIds: false,
      }),
    [map, seatingUnits],
  )
  const occupancyRef = useRef<Record<string, SeatStatus>>({})
  const loadedUpdatedAtRef = useRef<string | null>(null)
  const [tool, setTool] = useState<Tool>("select")
  const [placement, setPlacement] = useState<PalettePlacement | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [polygonDraft, setPolygonDraft] = useState<VenueMapPoint[]>([])
  const [rulesFocusId, setRulesFocusId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [showSeatLabels, setShowSeatLabels] = useState(false)
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
  const [ringCenter, setRingCenter] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [workMode, setWorkMode] = useState<VenueWorkMode>("architecture")
  const [magneticSnap, setMagneticSnap] = useState(true)
  const [vertexEditZoneId, setVertexEditZoneId] = useState<string | null>(null)
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
  const [isCanvasDirty, setIsCanvasDirty] = useState(false)
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
  const magneticSnapRef = useRef(true)
  const vertexEditZoneIdRef = useRef<string | null>(null)
  const vertexDrag = useRef<{
    zoneId: string
    index: number
    recorded: boolean
  } | null>(null)
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
  const mapBusy = saving || explicitSaveStatus === "saving"
  const hasUnsavedChanges = isCanvasDirty || polygonDraft.length > 0
  const hasUnsavedMapWork = hasUnsavedChanges
  useUnsavedChanges(hasUnsavedChanges)

  async function persistEditorMap() {
    if (!onSave && !eventId) return
    setExplicitSaveStatus("saving")
    try {
      const nextMap = parseVenueMap(mapRef.current)
      if (eventId?.trim()) {
        if (!loadedUpdatedAtRef.current) {
          const inventory = await loadVenueMapEditorInventory(eventId)
          if (!inventory.success) {
            setExplicitSaveStatus("error")
            toast.error(inventory.error)
            return
          }
          setSeatingUnits(inventory.seatingUnits)
          setLoadedUpdatedAt(inventory.updatedAt)
          loadedUpdatedAtRef.current = inventory.updatedAt
        }
        const saved = await saveVenueMapOnly(
          eventId,
          nextMap,
          loadedUpdatedAtRef.current,
        )
        if (!saved.success) {
          setExplicitSaveStatus("error")
          toast.error(saved.error)
          return
        }
        const refreshed = await loadVenueMapEditorInventory(eventId)
        if (refreshed.success) {
          setSeatingUnits(refreshed.seatingUnits)
          setLoadedUpdatedAt(refreshed.updatedAt)
          loadedUpdatedAtRef.current = refreshed.updatedAt
        } else {
          setLoadedUpdatedAt(saved.updatedAt)
          loadedUpdatedAtRef.current = saved.updatedAt
        }
      }
      if (onSave) await onSave(nextMap)
      setExplicitSaveStatus("saved")
      setIsCanvasDirty(false)
      toast.success("Mapa guardado correctamente")
    } catch (error) {
      setExplicitSaveStatus("error")
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }
  useEffect(() => {
    return () => {
      if (viewportAnimRef.current != null) {
        cancelAnimationFrame(viewportAnimRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const id = eventId?.trim()
    if (!id) return
    let cancelled = false
    void loadVenueMapEditorInventory(id).then((result) => {
      if (cancelled || !result.success) return
      setSeatingUnits(result.seatingUnits)
      setLoadedUpdatedAt(result.updatedAt)
      loadedUpdatedAtRef.current = result.updatedAt
    })
    return () => {
      cancelled = true
    }
  }, [eventId])
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
  const [toolbarCss, setToolbarCss] = useState<{
    x: number
    y: number
    placement: "above" | "below"
  } | null>(null)
  const spaceHeld = useRef(false)
  const shiftHeld = useRef(false)
  const [spacePan, setSpacePan] = useState(false)
  const [handPan, setHandPan] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const handPanRef = useRef(false)
  const liveSelection = useMemo(
    () => pruneVenueMapSelection(selection, map),
    [map, selection],
  )
  const previewRef = useRef(preview)
  useLayoutEffect(() => {
    isolationIdRef.current = isolationId
    activeZoneIdRef.current = activeZoneId
    workModeRef.current = workMode
    selectionRef.current = liveSelection
    compactChromeRef.current = compactChrome
    lassoModeRef.current = lassoMode
    seatEditModeRef.current = seatEditMode
    mapRef.current = map
    toolRef.current = tool
    polygonDraftRef.current = polygonDraft
    svgViewBoxRef.current = svgViewBox
    handPanRef.current = handPan
    previewRef.current = preview
    occupancyRef.current = occupancyBySeatId
    loadedUpdatedAtRef.current = loadedUpdatedAt
    magneticSnapRef.current = magneticSnap
    vertexEditZoneIdRef.current = vertexEditZoneId
  }, [
    isolationId,
    activeZoneId,
    workMode,
    liveSelection,
    compactChrome,
    lassoMode,
    seatEditMode,
    map,
    tool,
    polygonDraft,
    svgViewBox,
    handPan,
    preview,
    occupancyBySeatId,
    loadedUpdatedAt,
    magneticSnap,
    vertexEditZoneId,
  ])
  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  const cameraSyncTimer = useRef<number | null>(null)
  const polygonCursorRef = useRef<SVGCircleElement>(null)
  const polygonLineRef = useRef<SVGLineElement>(null)
  const polygonCloseRef = useRef<SVGCircleElement>(null)
  const actionsRef = useRef<{
    closePolygonDraft: (source?: { pointerId?: number }) => void
    cancelPolygonDraft: () => void
    applyPointerMove: (sample: PointerSample) => void
    cancelLiveTransform: () => void
    applyElementIds: (ids: string[], options?: { isolate?: boolean }) => void
    exitZoneIsolation: () => void
    deleteSelection: () => void
    nudgeSelection: (dx: number, dy: number) => void
    groupSelection: () => void
    ungroupSelection: () => void
    undo: () => void
    redo: () => void
    exitZoneVertexEdit: () => void
    hideEditorPolygonCursor: () => void
    setPolygonDraft: typeof setPolygonDraft
    setSpacePan: typeof setSpacePan
    setSelection: typeof setSelection
    setPlacement: typeof setPlacement
    setTool: typeof setTool
    setSeatEditMode: typeof setSeatEditMode
    setIsolationId: typeof setIsolationId
  } | null>(null)
  const selectionRef = useRef(liveSelection)
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
  const sceneGroupRef = useRef<SVGGElement>(null)
  const liveTransformRef = useRef<LiveTransform | null>(null)
  const [liveTransform, setLiveTransform] = useState<LiveTransform | null>(null)
  const [transformingKind, setTransformingKind] = useState<
    "move" | "scale" | "rotate" | null
  >(null)
  useEffect(() => {
    const current = selectionRef.current
    if (!current) return
    const occupancy = occupancyBySeatId
    if (!occupancy || Object.keys(occupancy).length === 0) return
    const locked =
      (current.kind === "element" &&
        elementIdsHaveCommittedStock(mapRef.current, [current.id], occupancy)) ||
      (current.kind === "elements" &&
        elementIdsHaveCommittedStock(mapRef.current, current.ids, occupancy)) ||
      (current.kind === "seats" &&
        seatKeysHaveCommittedStock(current.ids, occupancy))
    if (!locked) return
    transformDrag.current = null
    setLiveTransform(null)
    setTransformingKind(null)
    setIsolationId(null)
    setSelection(null)
  }, [occupancyBySeatId])
  useEffect(() => {
    if (!vertexEditZoneId) return
    if (tool !== "select") {
      setVertexEditZoneId(null)
      return
    }
    if (liveSelection?.kind !== "zone" || liveSelection.id !== vertexEditZoneId) {
      setVertexEditZoneId(null)
    }
  }, [liveSelection, tool, vertexEditZoneId])
  const [scaleHandle, setScaleHandle] = useState<ResizeHandle | null>(null)
  const compactChromeRef = useRef(compactChrome)
  const lassoModeRef = useRef(lassoMode)
  const pinchRef = useRef<PinchOrigin | null>(null)
  const suppressObjectDragUntil = useRef(0)
  const closingPolygonPointerId = useRef<number | null>(null)
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
      "¿Querés eliminar esto? Se va a borrar todo el mapa. Esta acción no se puede deshacer.",
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
    setIsCanvasDirty(true)
    onChange(cleared, venueMapToSeatingLayout(cleared))
    setSelection(null)
    setPolygonDraft([])
    hideEditorPolygonCursor()
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
    setIsCanvasDirty(true)
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
    liveSelection?.kind === "sector"
      ? (map.sectors ?? []).find((sector) => sector.id === liveSelection.id) ??
        null
      : null
  const selectedZone =
    liveSelection?.kind === "zone"
      ? (map.zones ?? []).find((zone) => zone.id === liveSelection.id) ?? null
      : null
  const selectedAisle =
    liveSelection?.kind === "aisle"
      ? (map.aisles ?? []).find((aisle) => aisle.id === liveSelection.id) ??
        null
      : null
  const selectedStage =
    liveSelection?.kind === "stage" && map.stage ? map.stage : null
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
    liveSelection?.kind === "element"
      ? (map.elements ?? []).find((item) => item.id === liveSelection.id) ??
        null
      : liveSelection?.kind === "elements" && liveSelection.ids.length === 1
        ? (map.elements ?? []).find((item) => item.id === liveSelection.ids[0]) ??
          null
        : null
  const selectedElementIds = useMemo(
    () =>
      liveSelection?.kind === "elements"
        ? liveSelection.ids
        : liveSelection?.kind === "element"
          ? [liveSelection.id]
          : [],
    [liveSelection],
  )
  useEffect(() => {
    selectedElementIdsRef.current = selectedElementIds
  }, [selectedElementIds])
  const selectedElements = useMemo(() => {
    const ids = new Set(selectedElementIds)
    return (map.elements ?? []).filter((item) => ids.has(item.id))
  }, [map.elements, selectedElementIds])
  const selectedGroupId = useMemo(() => {
    const fromOne = selectedElement?.groupId?.trim() ?? ""
    if (fromOne) return fromOne
    const groupIds = [
      ...new Set(
        selectedElements
          .map((item) => item.groupId?.trim() ?? "")
          .filter(Boolean),
      ),
    ]
    return groupIds.length === 1 ? groupIds[0]! : ""
  }, [selectedElement, selectedElements])
  const selectedGroupName = useMemo(() => {
    if (!selectedGroupId) return ""
    const head = (map.elements ?? []).find(
      (item) => item.groupId?.trim() === selectedGroupId,
    )
    return head?.groupName?.trim() || head?.sectorName?.trim() || ""
  }, [map.elements, selectedGroupId])
  const selectedIdSet = useMemo(
    () => new Set(selectedElementIds),
    [selectedElementIds],
  )
  const canShowTransform =
    !preview && tool === "select" && !handPan
  const computedBounds =
    canShowTransform && selectedElements.length > 0
      ? selectionBounds(selectedElements)
      : null
  const selectedSeatEntries = useMemo((): SelectedSeatEntry[] => {
    if (preview || tool !== "select" || handPan) return []
    if (liveSelection?.kind === "sector") {
      const sector = (map.sectors ?? []).find((item) => item.id === liveSelection.id)
      return (sector?.seats ?? []).map((seat) => ({
        key: seatKey(sector!.id, seat.id),
        x: seat.x,
        y: seat.y,
        source: "sector",
        ownerId: sector!.id,
        seatId: seat.id,
      }))
    }
    if (liveSelection?.kind !== "seats") return []
    return liveSelection.ids.flatMap((key): SelectedSeatEntry[] => {
      const { ownerId, seatId } = parseSeatSelectionKey(key)
      const sector = (map.sectors ?? []).find((item) => item.id === ownerId)
      const sectorSeat = sector?.seats?.find((item) => item.id === seatId)
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
      const elementSeat = element?.seats?.find((item) => item.id === seatId)
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
  }, [handPan, liveSelection, map.elements, map.sectors, preview, tool])
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
  const selectedSeatKeys = useMemo(() => {
    if (liveSelection?.kind !== "seats") return EMPTY_SEAT_KEYS
    return new Set(liveSelection.ids)
  }, [liveSelection])
  const selectedSectorId =
    liveSelection?.kind === "sector" ? liveSelection.id : null
  const selectedZoneBounds =
    canShowTransform && selectedZone
      ? (() => {
          const box = zoneCanvasAabb(selectedZone)
          return box ? aabbToRect(box) : null
        })()
      : null
  const selectedStageBounds =
    canShowTransform && selectedStage
      ? aabbToRect(
          rectAabb(
            {
              x: selectedStage.x,
              y: selectedStage.y,
              width: selectedStage.width,
              height: selectedStage.height,
            },
            selectedStage.rotation ?? 0,
          ),
        )
      : null
  const selectedAisleBounds =
    canShowTransform && selectedAisle
      ? {
          x: selectedAisle.x,
          y: selectedAisle.y,
          width: selectedAisle.width,
          height: selectedAisle.height,
        }
      : null
  const transformBounds =
    selectedZoneBounds ??
    selectedStageBounds ??
    selectedAisleBounds ??
    selectedSeatBounds ??
    measuredBounds ??
    computedBounds
  const seatGizmoActive = selection?.kind === "seats"
  const geometryLocked = workMode === "pricing"
  const selectionLocked =
    selectedElements.some((item) => item.isLocked === true) ||
    elementIdsHaveCommittedStock(map, selectedElementIds, occupancyBySeatId) ||
    (liveSelection?.kind === "seats" &&
      seatKeysHaveCommittedStock(liveSelection.ids, occupancyBySeatId))
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
  const renderMap = useMemo(() => {
    const locked = applyLocalStockLocks(map, occupancyBySeatId)
    return workMode === "pricing" ? applyHeatmapColors(locked) : locked
  }, [map, occupancyBySeatId, workMode])
  const unselectedElements = useMemo(
    () =>
      (renderMap.elements ?? []).filter((item) => !selectedIdSet.has(item.id)),
    [renderMap.elements, selectedIdSet],
  )
  const selectedRenderElements = useMemo(
    () =>
      (renderMap.elements ?? []).filter((item) => selectedIdSet.has(item.id)),
    [renderMap.elements, selectedIdSet],
  )
  const unselectedZones = useMemo(() => {
    const selectedZoneId =
      liveSelection?.kind === "zone" ? liveSelection.id : null
    return (renderMap.zones ?? []).filter((zone) => zone.id !== selectedZoneId)
  }, [liveSelection, renderMap.zones])
  const showElementSeats = (renderMap.elements?.length ?? 0) < 220
  const activePriceGroup = matchPriceGroupFromSelection(map, {
    sectorId: selectedSector?.id ?? null,
    zoneId: selectedZone?.id ?? null,
    elementIds: selectedElementIds,
  })

  useLayoutEffect(() => {
    if (
      preview ||
      tool !== "select" ||
      handPan ||
      selectedElementIds.length === 0 ||
      selection?.kind === "zone" ||
      selection?.kind === "stage" ||
      selection?.kind === "aisle"
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- getBBox is only valid after the SVG commits
      setMeasuredBounds((current) => (current ? null : current))
      return
    }
    const fallback = selectionBounds(selectedElements)
    if (transformingKind || liveTransform) {
      setMeasuredBounds((current) => current ?? fallback)
      return
    }
    const node = selectedVisualRef.current
    let next = fallback
    if (node && node.isConnected) {
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
    handPan,
    liveTransform,
    preview,
    selectedElementIds,
    selectedElements,
    selection?.kind,
    tool,
    transformingKind,
    zoom,
  ])

  function paintLive(next: LiveTransform | null) {
    liveTransformRef.current = next
    setLiveTransform(next)
  }

  function capturePointer(event: React.PointerEvent) {
    svgRef.current?.setPointerCapture(event.pointerId)
  }

  function isIdentityLive(live: LiveTransform) {
    if (live.type === "move") {
      return Math.abs(live.dx) < 0.05 && Math.abs(live.dy) < 0.05
    }
    if (live.type === "scale") {
      const { sx, sy } = liveScaleAxes(live)
      return Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001
    }
    return Math.abs(live.deg) < 0.05
  }

  function clearLiveUi() {
    paintLive(null)
    transformDrag.current = null
    setTransformingKind(null)
    setScaleHandle(null)
  }

  function snapActive(shiftKey: boolean) {
    return magneticSnapActive(
      magneticSnapRef.current,
      shiftKey || shiftHeld.current,
    )
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
    if (drag.target === "stage" && current.stage) {
      paintLive(null)
      commit({
        ...current,
        stage: applyLiveToStage(current.stage, snapped),
      })
      clearLiveUi()
      return
    }
    if (drag.target === "aisle" && drag.aisleId) {
      paintLive(null)
      commit({
        ...current,
        aisles: current.aisles.map((aisle) =>
          aisle.id === drag.aisleId ? applyLiveToAisle(aisle, snapped) : aisle,
        ),
      })
      clearLiveUi()
      return
    }
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
    return elementIdsHaveCommittedStock(
      mapRef.current,
      ids,
      occupancyRef.current,
    )
  }

  function inventoryHitHasCommittedStock(hit: InventoryHit) {
    const occupancy = occupancyRef.current
    if (hit.kind === "sector-seat") {
      return layoutIdHasCommittedStock(occupancy, hit.seatId, hit.sectorId)
    }
    if (hit.kind === "element-seat") {
      const element = ensureElements(mapRef.current).find(
        (item) => item.id === hit.elementId,
      )
      return (
        layoutIdHasCommittedStock(occupancy, hit.seatId, hit.elementId) ||
        (element != null && elementHasCommittedStock(element, occupancy))
      )
    }
    const element = ensureElements(mapRef.current).find(
      (item) => item.id === hit.elementId,
    )
    return element
      ? elementHasCommittedStock(element, occupancy)
      : layoutIdHasCommittedStock(occupancy, hit.elementId)
  }

  function refuseStockLocked() {
    toast.error(EDITOR_STOCK_LOCK_MESSAGE)
  }

  function unlockedElementIds(ids: readonly string[]) {
    const occupancy = occupancyRef.current
    return ids.filter((id) => {
      const element = ensureElements(mapRef.current).find((item) => item.id === id)
      return element
        ? !elementHasCommittedStock(element, occupancy)
        : !layoutIdHasCommittedStock(occupancy, id)
    })
  }

  function transformTargetFromSelection(): {
    zoneId?: string
    aisleId?: string
    target?: TransformTarget
  } {
    const current = selectionRef.current
    if (current?.kind === "zone") return { zoneId: current.id }
    if (current?.kind === "stage") return { target: "stage" }
    if (current?.kind === "aisle") return { target: "aisle", aisleId: current.id }
    if (
      current?.kind === "seats" ||
      current?.kind === "sector"
    ) {
      return { target: "seats" }
    }
    return {}
  }

  function objectDragSuppressed(pointerId?: number) {
    if (
      pointerId != null &&
      closingPolygonPointerId.current != null &&
      pointerId === closingPolygonPointerId.current
    ) {
      return true
    }
    return nowMs() < suppressObjectDragUntil.current
  }

  function beginGroupMove(
    ids: string[],
    event: React.PointerEvent,
    zoneId?: string,
  ) {
    if (objectDragSuppressed(event.pointerId)) return
    const seatIds = selectedSeatEntries.map((item) => item.key)
    const extras = zoneId ? { zoneId } : transformTargetFromSelection()
    const usingSeats =
      extras.target === "seats" ||
      (!extras.zoneId &&
        extras.target !== "stage" &&
        extras.target !== "aisle" &&
        ids.length === 0 &&
        seatIds.length > 0)
    if (
      ids.length === 0 &&
      !zoneId &&
      !extras.zoneId &&
      extras.target !== "stage" &&
      extras.target !== "aisle" &&
      !usingSeats
    ) {
      return
    }
    if (usingSeats) {
      if (seatKeysHaveCommittedStock(seatIds, occupancyRef.current)) {
        refuseStockLocked()
        return
      }
    } else if (
      !extras.zoneId &&
      extras.target !== "stage" &&
      extras.target !== "aisle" &&
      idsAreLocked(ids)
    ) {
      refuseStockLocked()
      return
    }
    const point = pointerToSvg(event)
    capturePointer(event)
    transformDrag.current = {
      mode: "move",
      ids: usingSeats ? seatIds : ids,
      ...extras,
      target: usingSeats ? "seats" : extras.target,
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
    if (idsAreLocked(selectedElementIds)) {
      refuseStockLocked()
      return
    }
    if (
      seatKeysHaveCommittedStock(
        selectedSeatEntries.map((item) => item.key),
        occupancyRef.current,
      )
    ) {
      refuseStockLocked()
      return
    }
    const point = pointerToSvg(event)
    const origin = resizeOrigin(bounds, handle)
    const corner = handlePoint(bounds, handle)
    const startDist = Math.hypot(point.x - origin.x, point.y - origin.y)
    capturePointer(event)
    const extras = transformTargetFromSelection()
    const usingSeats =
      extras.target === "seats" ||
      (!extras.zoneId &&
        extras.target !== "stage" &&
        extras.target !== "aisle" &&
        selectedElementIds.length === 0 &&
        selectedSeatEntries.length > 0)
    transformDrag.current = {
      mode: "scale",
      ids: usingSeats
        ? selectedSeatEntries.map((item) => item.key)
        : selectedElementIds,
      ...extras,
      target: usingSeats ? "seats" : extras.target,
      ox: origin.x,
      oy: origin.y,
      startDist: Math.max(startDist, 4),
      startCornerX: corner.x,
      startCornerY: corner.y,
      handle,
    }
    paintLive({
      type: "scale",
      ox: origin.x,
      oy: origin.y,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
    })
    setScaleHandle(handle)
    setTransformingKind("scale")
  }

  function beginRotate(bounds: BoundsRect, event: React.PointerEvent) {
    const extras = transformTargetFromSelection()
    const usingSeats =
      extras.target === "seats" ||
      (!extras.zoneId &&
        extras.target !== "stage" &&
        extras.target !== "aisle" &&
        selectedElementIds.length === 0 &&
        selectedSeatEntries.length > 0)
    if (usingSeats) {
      if (
        seatKeysHaveCommittedStock(
          selectedSeatEntries.map((item) => item.key),
          occupancyRef.current,
        )
      ) {
        refuseStockLocked()
        return
      }
    } else if (
      extras.target !== "stage" &&
      extras.target !== "aisle" &&
      extras.zoneId == null &&
      idsAreLocked(selectedElementIds)
    ) {
      refuseStockLocked()
      return
    }
    const point = pointerToSvg(event)
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2
    capturePointer(event)
    transformDrag.current = {
      mode: "rotate",
      ids: usingSeats
        ? selectedSeatEntries.map((item) => item.key)
        : selectedElementIds,
      ...extras,
      target: usingSeats ? "seats" : extras.target,
      cx,
      cy,
      startAngle: angleAt({ x: cx, y: cy }, point),
    }
    paintLive({ type: "rotate", cx, cy, deg: 0 })
    setTransformingKind("rotate")
  }

  function wantsCanvasPan(event: { button: number; altKey: boolean }) {
    return (
      event.button === 1 ||
      (event.button === 0 &&
        (event.altKey || spaceHeld.current || handPanRef.current))
    )
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
    const unlocked = unlockedElementIds(ids)
    if (ids.length > 0 && unlocked.length === 0) {
      refuseStockLocked()
      return
    }
    if (!options?.isolate) setIsolationId(null)
    setHandPan(false)
    setPlacement(null)
    setTool("select")
    const next = selectionFromIds(unlocked)
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
    if (!element?.id) return
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
    if (idsAreLocked(selectedElementIds)) {
      refuseStockLocked()
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
    if (idsAreLocked(selectedElementIds)) {
      refuseStockLocked()
      return
    }
    const current = mapRef.current
    const activeSelection = selectionRef.current
    if (activeSelection?.kind === "sector") {
      const sector = current.sectors.find(
        (item) => item.id === activeSelection.id,
      )
      if (!sector || sector.seats.length === 0) return
      if (
        seatKeysHaveCommittedStock(
          sector.seats.map((seat) => seatKey(sector.id, seat.id)),
          occupancyRef.current,
        )
      ) {
        refuseStockLocked()
        return
      }
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
    if (!element?.id) return
    blurCanvasTypingTarget()
    if (objectDragSuppressed(event.pointerId)) return
    if (wantsCanvasPan(event)) return
    isolateCanvasPointer(event, { preventGhostClick: true })
    if (event.button !== 0) return
    if (elementHasCommittedStock(element, occupancyRef.current)) {
      refuseStockLocked()
      return
    }
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
    const safe: InteractiveVenueMap = {
      ...next,
      elements: next.elements ?? [],
      zones: next.zones ?? [],
      sectors: next.sectors ?? [],
      labels: next.labels ?? [],
      aisles: next.aisles ?? [],
    }
    if (!options?.skipHistory) pushHistory()
    mapRef.current = safe
    setMap(safe)
    setIsCanvasDirty(true)
    setExplicitSaveStatus(null)
    try {
      onChange(safe, venueMapToSeatingLayout(safe))
    } catch {
      /* Keep the canvas usable if a parent persist throws. */
    }
    const pruned = pruneVenueMapSelection(selectionRef.current, safe)
    if (pruned !== selectionRef.current) {
      setSelection(pruned)
      if (!pruned) {
        setIsolationId(null)
        setContextMenu(null)
        setSeatEditMode(false)
        paintLive(null)
        setTransformingKind(null)
        elementDrag.current = null
      }
    }
  }

  function applyCanvasBackground(patch: VenueMapBackgroundPatch) {
    const current = mapRef.current
    if (!current) return
    const next = applyVenueMapBackgroundPatch(current, patch)
    if (!next) return
    commit(next)
  }

  function clearTransientSelection() {
    selectedElementIdsRef.current = []
    setSelection(null)
    setIsolationId(null)
    setContextMenu(null)
    setSeatEditMode(false)
    paintLive(null)
    setTransformingKind(null)
    elementDrag.current = null
  }

  function blurCanvasTypingTarget() {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return
    if (active === document.body) return
    if (active.isContentEditable || active.closest("input, textarea, select")) {
      active.blur()
    }
  }

  function popDraftVertex() {
    setPolygonDraft((points) => popPolygonDraft(points))
  }

  function undo() {
    if (
      shouldUndoPolygonDraft({
        tool: toolRef.current,
        draftLength: polygonDraftRef.current.length,
      })
    ) {
      popDraftVertex()
      return
    }
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
    const scene = sceneGroupRef.current
    const sceneMapped = clientPointToSvgUser(
      svg,
      scene?.getScreenCTM() ?? null,
      event.clientX,
      event.clientY,
    )
    if (scene && sceneMapped) return sceneMapped
    const viewBox = clientPointToSvgUser(
      svg,
      svg.getScreenCTM(),
      event.clientX,
      event.clientY,
    )
    if (!viewBox) return { x: 0, y: 0 }
    return viewBoxPointToWorld(viewBox, panRef.current, zoomRef.current)
  }

  function clientToViewBox(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return { x: CANVAS.width / 2, y: CANVAS.height / 2 }
    return (
      clientPointToSvgUser(svg, svg.getScreenCTM(), clientX, clientY) ?? {
        x: CANVAS.width / 2,
        y: CANVAS.height / 2,
      }
    )
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

  function polygonCursorNodes() {
    return {
      cursor: polygonCursorRef.current,
      line: polygonLineRef.current,
      closeRing: polygonCloseRef.current,
    }
  }

  function hideEditorPolygonCursor() {
    hidePolygonCursor(polygonCursorNodes())
  }

  function paintSceneCamera() {
    const node = sceneGroupRef.current
    if (!node) return
    const { x, y } = panRef.current
    node.setAttribute(
      "transform",
      `translate(${x} ${y}) scale(${zoomRef.current})`,
    )
  }

  function syncCameraReactState() {
    const nextPan = panRef.current
    const nextZoom = zoomRef.current
    setPan((prev) =>
      prev.x === nextPan.x && prev.y === nextPan.y ? prev : nextPan,
    )
    setZoom((prev) => (prev === nextZoom ? prev : nextZoom))
    const labels = nextZoom >= SEAT_LABEL_MIN_ZOOM
    setShowSeatLabels((prev) => (prev === labels ? prev : labels))
  }

  function scheduleCameraSync() {
    if (cameraSyncTimer.current != null) return
    cameraSyncTimer.current = window.requestAnimationFrame(() => {
      cameraSyncTimer.current = null
      syncCameraReactState()
    })
  }

  function applyViewport(
    next: { pan: { x: number; y: number }; zoom: number },
    options?: { syncReact?: boolean },
  ) {
    panRef.current = next.pan
    zoomRef.current = next.zoom
    paintSceneCamera()
    const labels = next.zoom >= SEAT_LABEL_MIN_ZOOM
    setShowSeatLabels((prev) => (prev === labels ? prev : labels))
    if (options?.syncReact === false) return
    scheduleCameraSync()
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
      applyViewport(
        {
          zoom: from.zoom + (to.zoom - from.zoom) * eased,
          pan: {
            x: from.pan.x + (to.pan.x - from.pan.x) * eased,
            y: from.pan.y + (to.pan.y - from.pan.y) * eased,
          },
        },
        { syncReact: false },
      )
      if (t < 1) {
        viewportAnimRef.current = requestAnimationFrame(step)
        return
      }
      viewportAnimRef.current = null
      syncCameraReactState()
    }
    viewportAnimRef.current = requestAnimationFrame(step)
  }

  function enterZoneVertexEdit(zone: VenueMapZone) {
    if (preview) return
    if (toolRef.current === "polygon") return
    abortTransientGestures()
    vertexDrag.current = null
    setVertexEditZoneId(zone.id)
    vertexEditZoneIdRef.current = zone.id
    setIsolationId(null)
    setSeatEditMode(false)
    setTool("select")
    setSelection({ kind: "zone", id: zone.id })
  }

  function exitZoneVertexEdit() {
    vertexDrag.current = null
    vertexEditZoneIdRef.current = null
    setVertexEditZoneId(null)
  }

  function beginVertexDrag(
    event: React.PointerEvent,
    zone: VenueMapZone,
    index: number,
  ) {
    if (geometryLocked || workModeRef.current === "pricing") return
    isolateCanvasPointer(event, { preventGhostClick: true })
    if (event.button !== 0) return
    capturePointer(event)
    vertexDrag.current = { zoneId: zone.id, index, recorded: false }
    setVertexEditZoneId(zone.id)
  }

  function applyVertexDragPoint(
    point: { x: number; y: number },
    shiftKey: boolean,
  ) {
    const dragState = vertexDrag.current
    if (!dragState) return
    if (!dragState.recorded) {
      pushHistory()
      dragState.recorded = true
    }
    const snapped = snapPointToGrid(point, snapActive(shiftKey))
    const current = mapRef.current
    commit(
      {
        ...current,
        zones: ensureZones(current).map((zone) =>
          zone.id === dragState.zoneId
            ? {
                ...zone,
                polygon: setPolygonVertexAtCanvas(
                  zone.polygon,
                  dragState.index,
                  snapped,
                ),
              }
            : zone,
        ),
      },
      { skipHistory: true },
    )
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
      { syncReact: false },
    )
  }

  function onCanvasPointerDownCapture(event: React.PointerEvent) {
    if (isEditorChromeTarget(event.target)) return
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
    syncCameraReactState()
  }

  function addSector(point?: { x: number; y: number }) {
    const current = mapRef.current
    const color = ZONE_COLORS[current.sectors.length % ZONE_COLORS.length]!
    const draft: VenueMapSector = {
      id: newId("sec"),
      name: `Sector ${current.sectors.length + 1}`,
      color,
      price: 0,
      x: point?.x ?? 220,
      y: point?.y ?? 160 + current.sectors.length * 28,
      rows: 6,
      seatsPerRow: 12,
      curvature: 0.45,
      aisle: true,
      seats: [],
    }
    draft.seats = rebuildSectorSeats(draft)
    commit({ ...current, sectors: [...current.sectors, draft] })
    setSelection({ kind: "sector", id: draft.id })
    setInspectorCollapsed(false)
    setTool("select")
  }

  function addStage() {
    const current = mapRef.current
    commit({
      ...current,
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

  function addLabel(point?: { x: number; y: number }) {
    const current = mapRef.current
    const presets = ["PLATEA BAJA", "PULLMAN", "GRADAS", "PALCOS"]
    const text = presets[current.labels.length % presets.length]!
    const id = newId("lbl")
    commit({
      ...current,
      labels: [
        ...current.labels,
        {
          id,
          text,
          x: point?.x ?? 320,
          y: point?.y ?? 100 + current.labels.length * 24,
          color: "#e4e4e7",
        },
      ],
    })
    setSelection({ kind: "label", id })
    setInspectorCollapsed(false)
    setTool("select")
  }

  function addAisle() {
    const current = mapRef.current
    const id = newId("aisle")
    commit({
      ...current,
      aisles: [
        ...current.aisles,
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
        if (patch.rowsConfig != null) {
          const grid = rowsConfigGridFields(patch.rowsConfig)
          next.rows = grid.rows
          next.seatsPerRow = grid.itemsPerRow
          next.rowsConfig = patch.rowsConfig
        } else if (patch.rows != null && next.rowsConfig) {
          next.rowsConfig = resizeRowsConfig(next.rowsConfig, patch.rows, {
            maxRows: 40,
            maxSeats: 40,
          })
          next.seatsPerRow = rowsConfigGridFields(next.rowsConfig).itemsPerRow
        }
        if (
          patch.rows != null ||
          patch.seatsPerRow != null ||
          patch.rowsConfig != null ||
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
        if (patch.layoutType != null || patch.seatingType != null) {
          next.seatingType =
            next.seatingType ??
            (next.layoutType === "general" ? "GENERAL" : "RESERVED")
        }
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
        if (next.layoutType === "numbered_seat") {
          const rowsConfig = resolveZoneRowsConfig(next)
          return {
            ...next,
            ...rowsConfigGridFields(rowsConfig),
            rowsConfig,
            capacityPerUnit: 1,
          }
        }
        const rows = Math.min(80, Math.max(1, Math.floor(next.rows) || 1))
        const itemsPerRow = Math.min(80, Math.max(1, Math.floor(next.itemsPerRow) || 1))
        const perUnit = Math.min(100, Math.max(1, Math.floor(next.capacityPerUnit) || 1))
        return {
          ...next,
          rows,
          itemsPerRow,
          capacityPerUnit: perUnit,
          capacity: rows * itemsPerRow * perUnit,
        }
      }),
    }, { skipHistory })
  }

  function closePolygonDraft(source?: { pointerId?: number }) {
    const points = polygonDraftRef.current
    if (points.length < 3) {
      toast.error("Trazá al menos 3 puntos para cerrar la zona.")
      return
    }
    const current = mapRef.current
    const created = createVenueZone(
      ensureZones(current).length,
      polygonFromCanvas(points),
    )
    closingPolygonPointerId.current =
      source?.pointerId ?? closingPolygonPointerId.current
    suppressObjectDragUntil.current = nowMs() + POLYGON_CLOSE_DRAG_GUARD_MS
    transformDrag.current = null
    elementDrag.current = null
    paintLive(null)
    setTransformingKind(null)
    commit({ ...current, zones: [...ensureZones(current), created] })
    setPolygonDraft([])
    hideEditorPolygonCursor()
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
    hideEditorPolygonCursor()
    setTool("select")
    setPlacement(null)
  }

  function ensureElements(current: InteractiveVenueMap): VenueMapElement[] {
    return current.elements ?? []
  }

  function placeAt(
    point: { x: number; y: number },
    nextPlacement = placement,
    options?: { shiftKey?: boolean },
  ) {
    if (workModeRef.current !== "architecture") return
    if (!nextPlacement) return
    point = snapPointToGrid(point, snapActive(options?.shiftKey ?? false))
    if (nextPlacement.kind === "zone_polygon") {
      setTool("polygon")
      setPlacement(nextPlacement)
      return
    }
    const current = mapRef.current
    if (nextPlacement.kind === "seat_block") {
      addSector(point)
      setPlacement(null)
      return
    }
    if (nextPlacement.kind === "label") {
      addLabel(point)
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
    if (nextPlacement.kind !== "element") return
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
    setInspectorCollapsed(false)
    setPlacement(null)
    setTool("select")
  }

  function patchElement(
    id: string,
    patch: Partial<VenueMapElement>,
    skipHistory = false,
  ) {
    const current = mapRef.current
    const target = ensureElements(current).find((item) => item.id === id)
    if (
      target &&
      elementHasCommittedStock(target, occupancyRef.current) &&
      STOCK_LOCKED_ELEMENT_PATCH_KEYS.some((key) => patch[key] != null)
    ) {
      refuseStockLocked()
      return
    }
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
    if (selectedElementIds.length === 0) return
    if (idsAreLocked(selectedElementIds)) {
      refuseStockLocked()
      return
    }
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
    if (idsAreLocked(ids)) {
      refuseStockLocked()
      return
    }
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

  function batchCustomLabel(customLabel: string) {
    const current = mapRef.current
    commit({
      ...current,
      elements: applyBulkElementCustomLabel(
        ensureElements(current),
        selectedElementIds,
        customLabel,
      ),
    })
  }

  function batchTicketType(ticket: {
    id: string
    name?: string
    price?: number
  }) {
    const current = mapRef.current
    const unlocked = unlockedElementIds(selectedElementIds)
    if (selectedElementIds.length > 0 && unlocked.length === 0) {
      refuseStockLocked()
      return
    }
    if (unlocked.length < selectedElementIds.length) {
      refuseStockLocked()
    }
    commit({
      ...current,
      elements: applyBulkElementTicketType(
        ensureElements(current),
        unlocked,
        ticket,
      ),
    })
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
    const occupancy = occupancyRef.current
    const locked = new Map(
      ensureElements(current)
        .filter((item) => elementHasCommittedStock(item, occupancy))
        .map((item) => [item.id, item]),
    )
    if (locked.size === 0) {
      commit({ ...current, elements: next })
      return
    }
    let blocked = false
    const merged = next.map((item) => {
      const previous = locked.get(item.id)
      if (!previous) return item
      if (
        previous.ticketTypeId !== item.ticketTypeId ||
        previous.zoneId !== item.zoneId ||
        previous.groupId !== item.groupId ||
        previous.type !== item.type ||
        previous.x !== item.x ||
        previous.y !== item.y ||
        previous.width !== item.width ||
        previous.height !== item.height ||
        previous.rotation !== item.rotation
      ) {
        blocked = true
      }
      return previous
    })
    if (blocked) refuseStockLocked()
    commit({ ...current, elements: merged })
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
    patch: { price?: number; color?: string; name?: string },
  ) {
    commit(applyVenuePriceGroupPatch(mapRef.current, group, patch))
  }

  function renameSelectedGroup(name: string) {
    if (!selectedGroupId) return
    commit(
      applyVenuePriceGroupPatch(
        mapRef.current,
        {
          key: `group:${selectedGroupId}`,
          name,
          color: "#000000",
          count: 0,
          unit: "",
          price: 0,
          priceHint: "",
          match: { kind: "group", groupId: selectedGroupId },
        },
        { name },
      ),
    )
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
    if (selectedElementIds.length < 2) return
    if (idsAreLocked(selectedElementIds)) {
      refuseStockLocked()
      return
    }
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
    if (idsAreLocked(selectedElementIds)) {
      refuseStockLocked()
      return
    }
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
    if (seatKeysHaveCommittedStock([...keys], occupancyRef.current)) {
      refuseStockLocked()
      return
    }
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
    const fallbackIds = selectedElementIdsRef.current
    if (!currentSelection && fallbackIds.length === 0) return
    clearTransientSelection()
    if (!currentSelection) {
      const ids = new Set(fallbackIds)
      commit({
        ...current,
        elements: ensureElements(current).filter((item) => !ids.has(item.id)),
      })
      return
    }
    if (currentSelection.kind === "stage") {
      commit({ ...current, stage: null })
    } else if (currentSelection.kind === "sector") {
      commit({
        ...current,
        sectors: (current.sectors ?? []).filter(
          (sector) => sector.id !== currentSelection.id,
        ),
      })
    } else if (currentSelection.kind === "label") {
      commit({
        ...current,
        labels: (current.labels ?? []).filter((label) => label.id !== currentSelection.id),
      })
    } else if (currentSelection.kind === "aisle") {
      commit({
        ...current,
        aisles: (current.aisles ?? []).filter((aisle) => aisle.id !== currentSelection.id),
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
      return
    } else if (currentSelection.kind === "zone") {
      commit({
        ...current,
        zones: ensureZones(current).filter(
          (zone) => zone.id !== currentSelection.id,
        ),
      })
    }
  }

  function openObjectMenu(event: React.MouseEvent, target: ContextTarget) {
    if (!target?.kind) return
    if ("id" in target && !target.id) return
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
    if (idsAreLocked(selectedElementIds)) {
      refuseStockLocked()
      return
    }
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
    const unlocked = ids.filter(
      (key) => !seatKeysHaveCommittedStock([key], occupancyRef.current),
    )
    if (ids.length > 0 && unlocked.length === 0) {
      refuseStockLocked()
      return
    }
    setSeatEditMode(true)
    setSelection({ kind: "seats", ids: unlocked })
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
    if (!element?.id) return
    if (workModeRef.current === "pricing") return
    if (elementHasCommittedStock(element, occupancyRef.current)) {
      isolateCanvasPointer(event)
      event.preventDefault()
      refuseStockLocked()
      return
    }
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
    if (!element?.id || !seatId) return
    isolateCanvasPointer(event)
    event.preventDefault()
    if (
      layoutIdHasCommittedStock(occupancyRef.current, seatId, element.id) ||
      elementHasCommittedStock(element, occupancyRef.current)
    ) {
      refuseStockLocked()
      return
    }
    beginElementSeatEdit(element, seatId, event.shiftKey)
  }

  function convertSelectionToIndividualSeats() {
    if (workModeRef.current === "pricing") return
    if (idsAreLocked(selectedElementIds)) {
      refuseStockLocked()
      return
    }
    const current = mapRef.current
    const activeSelection = selectionRef.current
    if (activeSelection?.kind === "sector") {
      const sector = current.sectors.find(
        (item) => item.id === activeSelection.id,
      )
      if (!sector || sector.seats.length === 0) return
      if (
        seatKeysHaveCommittedStock(
          sector.seats.map((seat) => seatKey(sector.id, seat.id)),
          occupancyRef.current,
        )
      ) {
        refuseStockLocked()
        return
      }
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
    if (!element?.id || !seatId) return
    blurCanvasTypingTarget()
    if (wantsCanvasPan(event)) return
    isolateCanvasPointer(event, { preventGhostClick: true })
    if (event.button !== 0) return
    if (
      layoutIdHasCommittedStock(occupancyRef.current, seatId, element.id) ||
      elementHasCommittedStock(element, occupancyRef.current)
    ) {
      refuseStockLocked()
      return
    }
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
      customLabel?: string
      ticketTypeId?: string
      row?: string
    },
  ) {
    if (keys.size === 0) return
    if (seatKeysHaveCommittedStock([...keys], occupancyRef.current)) {
      refuseStockLocked()
      return
    }
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
    customLabel?: string
    ticketTypeId?: string
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
    if (!selectedElement?.id) return
    const seats = selectedElement.seats ?? []
    const firstSeat = seats[0]
    const current = parseManualSeatFields({
      label: next.label ?? selectedElement.label,
      row: next.row ?? firstSeat?.row,
      number: next.number ?? firstSeat?.number,
    })
    const parsedNumber = parseSeatNumberInput(current.number)
    patchElement(selectedElement.id, {
      label: current.label,
      customLabel: current.label,
      labelLocked: true,
      seats: seats.map((seat, index) =>
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
    if (!zone?.id) return
    blurCanvasTypingTarget()
    if (preview) return
    if (objectDragSuppressed(event.pointerId)) return
    if (wantsCanvasPan(event)) return
    isolateCanvasPointer(event, { preventGhostClick: true })
    if (event.button !== 0) return
    if (event.detail >= 2) {
      cancelLiveTransform()
      enterZoneVertexEdit(zone)
      return
    }
    if (
      vertexEditZoneIdRef.current &&
      vertexEditZoneIdRef.current !== zone.id
    ) {
      exitZoneVertexEdit()
    }
    setIsolationId(null)
    setHandPan(false)
    setPlacement(null)
    setTool("select")
    setSelection({ kind: "zone", id: zone.id })
    requestMobileProperties()
    if (vertexEditZoneIdRef.current === zone.id) return
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
    if (!svgRef.current) return
    blurCanvasTypingTarget()
    if (pinchRef.current || pointersRef.current.size > 1) return
    if (wantsCanvasPan(event)) {
      beginCanvasPan(event)
      return
    }
    if (event.button !== 0) return
    const point = pointerToSvg(event)
    if (toolRef.current === "polygon") {
      event.preventDefault()
      const raw = {
        x: Math.round(point.x * 10) / 10,
        y: Math.round(point.y * 10) / 10,
      }
      const draft = polygonDraftRef.current
      if (isCloseToFirstVertex(draft, raw)) {
        closePolygonDraft({ pointerId: event.pointerId })
        return
      }
      if (event.detail >= 2) {
        if (draft.length >= 3) {
          closePolygonDraft({ pointerId: event.pointerId })
        }
        return
      }
      const next = snapPointToGrid(raw, snapActive(event.shiftKey))
      setPolygonDraft((current) => [...current, next])
      return
    }
    if (placement && workModeRef.current === "architecture" && !event.altKey && !spaceHeld.current) {
      placeAt(point, placement, { shiftKey: event.shiftKey })
      return
    }
    if (toolRef.current !== "select") return
    if (
      emptyCanvasDragAction({
        compactChrome: compactChromeRef.current,
        lassoMode: lassoModeRef.current,
      }) === "ignore"
    ) {
      if (!event.shiftKey && !shouldBlockCanvasDeselect()) {
        setIsolationId(null)
        setSelection(null)
        exitZoneVertexEdit()
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
      exitZoneVertexEdit()
    }
  }

  function handleInventoryPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (previewRef.current) return
    if (wantsCanvasPan(event) || toolRef.current === "polygon") {
      onPointerDown(event)
      return
    }
    const hit = inventoryHitFromEvent(event.nativeEvent)
    if (!hit) {
      onPointerDown(event)
      return
    }
    if (inventoryHitHasCommittedStock(hit)) {
      isolateCanvasPointer(event, { preventGhostClick: true })
      refuseStockLocked()
      return
    }
    if (hit.kind === "sector-seat") {
      blurCanvasTypingTarget()
      isolateCanvasPointer(event, { preventGhostClick: true })
      if (event.button !== 0) return
      if (event.detail >= 2 || seatEditModeRef.current || event.shiftKey) {
        elementDrag.current = null
        setIsPanning(false)
        cancelLiveTransform()
        const current = selectionRef.current
        const nextIds =
          event.shiftKey && current?.kind === "seats"
            ? [...new Set([...current.ids, hit.seatKey])]
            : [hit.seatKey]
        enterSeatEdit(nextIds)
        return
      }
      setIsolationId(null)
      setSelection({ kind: "sector", id: hit.sectorId })
      requestMobileProperties()
      return
    }
    if (hit.kind === "element-seat") {
      const element = ensureElements(mapRef.current).find(
        (item) => item.id === hit.elementId,
      )
      if (element) onMapSeatPointerDown(event, element, hit.seatId)
      return
    }
    const element = ensureElements(mapRef.current).find(
      (item) => item.id === hit.elementId,
    )
    if (element) onMapElementPointerDown(event, element)
  }

  function handleInventoryContextMenu(event: React.MouseEvent<SVGSVGElement>) {
    event.preventDefault()
    if (previewRef.current) return
    const hit = inventoryHitFromEvent(event.nativeEvent)
    if (hit && inventoryHitHasCommittedStock(hit)) {
      refuseStockLocked()
      return
    }
    if (hit?.kind === "sector-seat") {
      openObjectMenu(event, { kind: "sector", id: hit.sectorId })
      return
    }
    if (hit?.kind === "element-seat" || hit?.kind === "element") {
      openObjectMenu(event, { kind: "element", id: hit.elementId })
    }
  }

  function handleInventoryDoubleClick(event: React.MouseEvent<SVGSVGElement>) {
    if (previewRef.current || toolRef.current === "polygon") return
    const hit = inventoryHitFromEvent(event.nativeEvent)
    if (hit && inventoryHitHasCommittedStock(hit)) {
      isolateCanvasPointer(event)
      event.preventDefault()
      refuseStockLocked()
      return
    }
    if (hit?.kind === "sector-seat") {
      isolateCanvasPointer(event)
      event.preventDefault()
      beginSeatEditFromPointer([hit.seatKey], event.shiftKey)
      return
    }
    if (hit?.kind === "element-seat") {
      const element = ensureElements(mapRef.current).find(
        (item) => item.id === hit.elementId,
      )
      if (element) onMapSeatDoubleClick(event, element, hit.seatId)
      return
    }
    if (hit?.kind === "element") {
      const element = ensureElements(mapRef.current).find(
        (item) => item.id === hit.elementId,
      )
      if (element) onMapElementDoubleClick(event, element)
    }
  }

  function handleInventoryPointerOver(event: React.PointerEvent<SVGSVGElement>) {
    const hit = inventoryHitFromEvent(event.nativeEvent)
    if (hit?.kind !== "element" && hit?.kind !== "element-seat") return
    const element = ensureElements(mapRef.current).find(
      (item) => item.id === hit.elementId,
    )
    if (element) onMapElementPointerEnter(event, element)
  }

  function handleInventoryPointerOut(event: React.PointerEvent<SVGSVGElement>) {
    const next = inventoryHitFromNode(event.relatedTarget)
    if (next?.kind === "element" || next?.kind === "element-seat") return
    onMapElementPointerLeave()
  }

  function applyPointerMove(sample: PointerSample) {
    if (pinchRef.current) return
    if (vertexDrag.current) {
      applyVertexDragPoint(pointerToSvg(sample), sample.shiftKey)
      return
    }
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
        const axes = scaleFromHandlePointer({
          handle: transforming.handle,
          origin: { x: transforming.ox, y: transforming.oy },
          startCorner: {
            x: transforming.startCornerX,
            y: transforming.startCornerY,
          },
          point,
          uniform: snapActive(sample.shiftKey),
          startDist: transforming.startDist,
        })
        paintLive({
          type: "scale",
          ox: transforming.ox,
          oy: transforming.oy,
          scale: axes.scale,
          scaleX: axes.scaleX,
          scaleY: axes.scaleY,
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
      const delta = clientDeltaToViewBox(
        svgRef.current?.getScreenCTM(),
        sample.clientX - moving.startX,
        sample.clientY - moving.startY,
      )
      const nextPan = {
        x: moving.origX + delta.x,
        y: moving.origY + delta.y,
      }
      panRef.current = nextPan
      paintSceneCamera()
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
    if (previewRef.current) return
    if (toolRef.current === "polygon") {
      const point = pointerToSvg(event)
      paintPolygonCursor(polygonCursorNodes(), point, polygonDraftRef.current)
      return
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
    if (vertexDrag.current) {
      if (pointerFrame.current != null) {
        window.cancelAnimationFrame(pointerFrame.current)
        pointerFrame.current = null
      }
      if (pendingPointer.current) {
        applyPointerMove(pendingPointer.current)
        pendingPointer.current = null
      }
      vertexDrag.current = null
      return
    }
    syncCameraReactState()
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
    if (closingPolygonPointerId.current === event.pointerId) {
      closingPolygonPointerId.current = null
    }
    if (pinchRef.current) return
    finishPointerGesture(event.shiftKey)
  }

  function onPointerLeave(event: React.PointerEvent<SVGSVGElement>) {
    if (toolRef.current === "polygon") hideEditorPolygonCursor()
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
          const sector = (map.sectors ?? []).find((item) => item.id === ownerId)
          const sectorSeat = sector?.seats?.find((item) => item.id === seatId)
          if (sector && sectorSeat) {
            return { source: "sector" as const, sector, seat: sectorSeat }
          }
          const element = (map.elements ?? []).find((item) => item.id === ownerId)
          const elementSeat = element?.seats?.find((item) => item.id === seatId)
          if (element && elementSeat) {
            return { source: "element" as const, element, seat: elementSeat }
          }
          return null
        })()
      : null
  const capacity = useMemo(() => venueMapCapacity(map), [map])
  const canUndo =
    undoCount > 0 ||
    shouldUndoPolygonDraft({ tool, draftLength: polygonDraft.length })
  const canRedo = redoCount > 0
  const isWorkspace = variant === "workspace"
  const isStudio = variant === "studio" || isWorkspace
  const eventEditHref = eventId?.trim()
    ? `/admin/events/${eventId.trim()}/edit?step=2`
    : null

  function handleLeaveEditor() {
    if (
      hasUnsavedMapWork &&
      !window.confirm(UNSAVED_MAP_CHANGES_MESSAGE)
    ) {
      return
    }
    if (onClose) {
      onClose()
      return
    }
    if (eventEditHref) {
      router.push(eventEditHref)
      return
    }
    if (backHref && backHref !== "/admin" && backHref !== "/admin/events") {
      router.push(backHref)
    }
  }

  const canLeaveEditor = Boolean(onClose || eventEditHref || backHref)
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
    if (liveSelection?.kind === "stage") {
      return { title: map.stage?.label || "Escenario", detail: "Escenario" }
    }
    if (liveSelection?.kind === "label") {
      const text = (map.labels ?? []).find((item) => item.id === liveSelection.id)
        ?.text
      return { title: text || "Etiqueta", detail: "Texto de nivel" }
    }
    if (selectedAisle) {
      return { title: "Pasillo", detail: "Circulación" }
    }
    return {
      title: "Propiedades del lienzo",
      detail: "Foto de fondo, opacidad y encaje del recinto.",
    }
  })()
  const selectedNode = singleSeat
    ? ({ kind: "seat" } as const)
    : selectedZone
      ? ({ kind: "zone" } as const)
      : selectedSector
        ? ({ kind: "sector" } as const)
        : selectedElement && selectedElements.length === 1
          ? ({ kind: "element" } as const)
          : selectedElements.length > 1
            ? ({ kind: "elements" } as const)
            : liveSelection?.kind === "seats"
              ? ({ kind: "seats" } as const)
              : liveSelection?.kind === "stage"
                ? ({ kind: "stage" } as const)
                : liveSelection?.kind === "label"
                  ? ({ kind: "label" } as const)
                  : liveSelection?.kind === "aisle"
                    ? ({ kind: "aisle" } as const)
                    : null
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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- latest closures for bind-once keyboard
  useLayoutEffect(() => {
    actionsRef.current = {
      closePolygonDraft,
      cancelPolygonDraft,
      applyPointerMove,
      cancelLiveTransform,
      applyElementIds,
      exitZoneIsolation,
      deleteSelection,
      nudgeSelection,
      groupSelection,
      ungroupSelection,
      undo,
      redo,
      exitZoneVertexEdit,
      hideEditorPolygonCursor,
      setPolygonDraft,
      setSpacePan,
      setSelection,
      setPlacement,
      setTool,
      setSeatEditMode,
      setIsolationId,
    }
  })

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
      const actions = actionsRef.current
      if (!actions || previewRef.current) return
      const drawingPolygon =
        toolRef.current === "polygon" || polygonDraftRef.current.length > 0
      if (drawingPolygon && event.key === "Enter") {
        event.preventDefault()
        actions.closePolygonDraft()
        return
      }
      if (drawingPolygon && event.key === "Escape") {
        event.preventDefault()
        actions.cancelPolygonDraft()
        return
      }
      if (drawingPolygon && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault()
        actions.setPolygonDraft((points) => {
          if (points.length <= 1) {
            queueMicrotask(() => actions.cancelPolygonDraft())
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
        actions.setSpacePan(true)
        return
      }
      if (event.key === "Shift") {
        shiftHeld.current = true
        const sample = pendingPointer.current
        if (sample && (transformDrag.current || vertexDrag.current)) {
          actions.applyPointerMove({ ...sample, shiftKey: true })
        }
        return
      }
      if (event.key === "Escape") {
        if (toolRef.current === "polygon" || polygonDraftRef.current.length > 0) {
          event.preventDefault()
          actions.cancelPolygonDraft()
          return
        }
        if (vertexEditZoneIdRef.current) {
          event.preventDefault()
          actions.exitZoneVertexEdit()
          return
        }
        if (liveTransformRef.current || transformDrag.current) {
          event.preventDefault()
          actions.cancelLiveTransform()
          return
        }
        const isolatedId = isolationIdRef.current
        if (isolatedId || seatEditModeRef.current) {
          event.preventDefault()
          const members = isolatedId
            ? elementGroupMembers(ensureElements(mapRef.current), isolatedId)
            : []
          actions.setSeatEditMode(false)
          actions.setIsolationId(null)
          if (members.length > 0) {
            actions.applyElementIds(members.map((item) => item.id))
          } else {
            actions.setSelection(null)
          }
          return
        }
        if (activeZoneIdRef.current) {
          event.preventDefault()
          actions.exitZoneIsolation()
          return
        }
        if (selectionRef.current) {
          event.preventDefault()
          actions.setSelection(null)
          actions.setPlacement(null)
          actions.setTool("select")
        }
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectionRef.current || selectedElementIdsRef.current.length > 0) {
          event.preventDefault()
          actions.deleteSelection()
        }
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        actions.nudgeSelection(0, event.shiftKey ? -16 : -8)
        return
      }
      if (event.key === "ArrowDown") {
        event.preventDefault()
        actions.nudgeSelection(0, event.shiftKey ? 16 : 8)
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        actions.nudgeSelection(event.shiftKey ? -16 : -8, 0)
        return
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        actions.nudgeSelection(event.shiftKey ? 16 : 8, 0)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
        event.preventDefault()
        if (event.shiftKey) actions.ungroupSelection()
        else actions.groupSelection()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) actions.redo()
        else actions.undo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault()
        actions.redo()
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      const actions = actionsRef.current
      if (event.code === "Space") {
        spaceHeld.current = false
        actions?.setSpacePan(false)
      }
      if (event.key === "Shift") {
        shiftHeld.current = false
        const sample = pendingPointer.current
        if (sample && (transformDrag.current || vertexDrag.current)) {
          actions?.applyPointerMove({ ...sample, shiftKey: false })
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
  }, [])

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
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("mousedown", preventMiddleScroll)
      el.removeEventListener("auxclick", preventMiddleScroll)
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
      if (cameraSyncTimer.current != null) {
        window.cancelAnimationFrame(cameraSyncTimer.current)
      }
    }
  }, [])

  useLayoutEffect(() => {
    paintSceneCamera()
  })

  useEffect(() => {
    if (tool !== "polygon") {
      hidePolygonCursor({
        cursor: polygonCursorRef.current,
        line: polygonLineRef.current,
        closeRing: polygonCloseRef.current,
      })
    }
  }, [tool])

  function openPreview() {
    if (onPreview) onPreview()
    else setPreview(true)
  }

  function viewportCenterWorld() {
    const svg = svgRef.current
    const rect = svg?.getBoundingClientRect()
    if (!svg || !rect || rect.width < 2 || !svg.getScreenCTM()) {
      return fallbackWorldCenter(CANVAS.width, CANVAS.height)
    }
    return pointerToSvg({
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    })
  }

  function pickPaletteItem(next: PalettePlacement) {
    if (workModeRef.current === "pricing") return
    workModeRef.current = "architecture"
    setWorkMode("architecture")
    setHandPan(false)
    setInspectorCollapsed(false)
    if (next.kind === "zone_polygon") {
      setPlacement(next)
      setTool("polygon")
      setPolygonDraft([])
      hideEditorPolygonCursor()
      setSelection(null)
      setToolsOpen(false)
      return
    }
    if (next.kind === "grid_array") {
      setGridArrayOrigin(viewportCenterWorld())
      setGridArrayOpen(true)
      setPlacement(null)
      setTool("select")
      setToolsOpen(false)
      return
    }
    if (next.kind === "rings") {
      setRingCenter(viewportCenterWorld())
      setShowRings(true)
      setPlacement(null)
      setTool("select")
      setToolsOpen(false)
      requestMobileProperties()
      return
    }
    placeAt(viewportCenterWorld(), next)
    setToolsOpen(false)
    requestMobileProperties()
  }

  function pickFloatingTool(next: FloatingDrawTool) {
    if (workModeRef.current === "pricing" && next !== "select" && next !== "pan") {
      return
    }
    if (next === "select") {
      setHandPan(false)
      setTool("select")
      setPlacement(null)
      return
    }
    if (next === "pan") {
      setHandPan(true)
      setTool("select")
      setPlacement(null)
      return
    }
    setHandPan(false)
    pickPaletteItem({ kind: "zone_polygon" })
  }

  function selectFromLayerTree(next: LayerTreeSelection) {
    setHandPan(false)
    setTool("select")
    setPlacement(null)
    setInspectorCollapsed(false)
    setIsolationId(null)
    if (next.kind === "seats") {
      enterSeatEdit(next.ids)
      return
    }
    setSeatEditMode(false)
    setSelection(next)
  }

  const floatingTool: FloatingDrawTool = handPan
    ? "pan"
    : tool === "polygon"
      ? "polygon"
      : "select"
  const objectHitsEnabled = tool !== "polygon"

  const hasPropertiesTarget =
    Boolean(liveSelection) ||
    workMode === "pricing" ||
    workMode === "indexing" ||
    workMode === "architecture"
  const propertiesTargetKey =
    liveSelection?.kind === "seats"
      ? liveSelection.ids[0] ?? "seats"
      : liveSelection?.kind === "elements"
        ? liveSelection.ids[0] ?? "elements"
        : liveSelection && "id" in liveSelection && liveSelection.id
          ? liveSelection.id
          : "predio"
  const mobileSheetOpen = toolsOpen || propertiesOpen || modesOpen
  const showSelectionToolbar =
    selectedElements.length >= 1 &&
    !geometryLocked &&
    !transformingKind &&
    !preview &&
    !isPanning &&
    tool === "select"
  useLayoutEffect(() => {
    if (!showSelectionToolbar || !transformBounds) {
      setToolbarCss((current) => (current ? null : current))
      return
    }
    const svg = svgRef.current
    const scene = sceneGroupRef.current
    const canvas = canvasRef.current
    if (!svg || !scene || !canvas) {
      setToolbarCss((current) => (current ? null : current))
      return
    }
    const ctm = scene.getScreenCTM()
    const rect = canvas.getBoundingClientRect()
    const midX = transformBounds.x + transformBounds.width / 2
    const topScreen = svgUserToClient(svg, ctm, midX, transformBounds.y)
    const bottomScreen = svgUserToClient(
      svg,
      ctm,
      midX,
      transformBounds.y + transformBounds.height,
    )
    if (!topScreen || !bottomScreen) {
      setToolbarCss((current) => (current ? null : current))
      return
    }
    const top = clientPointInContainer(topScreen, rect)
    const bottom = clientPointInContainer(bottomScreen, rect)
    const placement = top.y < 52 ? ("below" as const) : ("above" as const)
    const next = placement === "below" ? bottom : top
    setToolbarCss((current) => {
      if (
        current &&
        current.placement === placement &&
        Math.abs(current.x - next.x) < 0.5 &&
        Math.abs(current.y - next.y) < 0.5
      ) {
        return current
      }
      return { x: next.x, y: next.y, placement }
    })
  }, [
    liveTransform,
    pan,
    showSelectionToolbar,
    svgViewBox,
    transformBounds,
    zoom,
  ])

  const historyToolbar = !compactChrome ? (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title="Deshacer (Ctrl+Z)"
        aria-label="Deshacer (Ctrl+Z)"
        disabled={!canUndo}
        onClick={undo}
        className="h-8 px-2 text-muted-foreground"
      >
        <Undo2 className="size-3.5" />
        <span className="hidden xl:inline">Deshacer</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title="Rehacer (Ctrl+Y)"
        aria-label="Rehacer (Ctrl+Y)"
        disabled={!canRedo}
        onClick={redo}
        className="h-8 px-2 text-muted-foreground"
      >
        <Redo2 className="size-3.5" />
        <span className="hidden xl:inline">Rehacer</span>
      </Button>
      <Button
        type="button"
        variant={magneticSnap ? "secondary" : "ghost"}
        size="sm"
        title="Atracción Magnética (Shift invierte)"
        aria-label="Atracción Magnética"
        aria-pressed={magneticSnap}
        onClick={() => setMagneticSnap((value) => !value)}
        className="h-8 px-2"
      >
        <Magnet className="size-3.5" />
        <span className="hidden xl:inline">Atracción Magnética</span>
      </Button>
    </div>
  ) : null

  const saveChangesButton = onSave || eventId ? (
    <Button
      type="button"
      disabled={mapBusy}
      onClick={() => {
        void persistEditorMap()
      }}
      className="h-8 shrink-0 bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
    >
      <Save className="size-3.5" />
      Guardar Cambios
    </Button>
  ) : null

  const toolbar = (
    <div className="z-20 flex w-full flex-wrap items-center gap-2 overflow-hidden border-b border-border bg-card px-3 py-2 text-card-foreground">
      <VenueWorkModeTabs
        layout="stepper"
        value={workMode}
        onChange={setStudioWorkMode}
        className={cn("min-w-0 shrink-0", compactChrome && "hidden")}
      />
      <div className="ml-auto flex items-center gap-1.5">
        {historyToolbar}
        {saveChangesButton}
      </div>
    </div>
  )

  const workspaceHeader = (
    <header className="z-30 flex h-14 shrink-0 items-center overflow-hidden border-b border-border bg-card px-3 text-card-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-3">
        {canLeaveEditor ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleLeaveEditor}
            className="h-8 shrink-0 px-1.5 text-xs text-muted-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden lg:inline">{backLabel === "Volver al evento" ? "Salir" : backLabel}</span>
          </Button>
        ) : null}
        {onEventTitleChange ? (
          <Input
            value={eventTitle}
            onChange={(event) => onEventTitleChange(event.target.value)}
            aria-label="Nombre del evento"
            className="h-8 min-w-0 max-w-[14rem] truncate border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none focus-visible:border-border"
          />
        ) : (
          <p className="truncate text-sm font-semibold text-foreground">
            {eventTitle}
          </p>
        )}
      </div>
      <div className={cn("flex shrink-0 justify-center px-2", compactChrome && "hidden")}>
        <VenueWorkModeTabs
          layout="stepper"
          value={workMode}
          onChange={setStudioWorkMode}
        />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 pl-3">
        {historyToolbar}
        {saveChangesButton}
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
      {isStudio ? workspaceHeader : toolbar}

      <div
        className={cn(
          isStudio || compactChrome
            ? "flex min-h-0 flex-1 overflow-hidden"
            : "grid lg:grid-cols-[220px_1fr_280px]",
        )}
      >
        {(workMode === "architecture" || isWorkspace || isStudio) &&
        !compactChrome ? (
          isStudio ? (
            <VenueStudioSidebar
              map={map}
              selection={liveSelection}
              onSelect={selectFromLayerTree}
              onSpawn={pickPaletteItem}
              activePlacement={placement}
              collapsed={paletteCollapsed}
              onCollapsedChange={setPaletteCollapsed}
              activeZoneId={activeZoneId}
              spawnDisabled={geometryLocked}
              className={isWorkspace ? "h-full" : undefined}
            />
          ) : (
            <VenueLayerTree
              map={map}
              selection={selection}
              onSelect={selectFromLayerTree}
              activeZoneId={activeZoneId}
              className="w-full"
            />
          )
        ) : null}
        <div
          ref={canvasRef}
          className={cn(
            "relative overflow-hidden touch-none overscroll-none select-none bg-slate-100 bg-[radial-gradient(circle_at_1px_1px,#cbd5e1_1px,transparent_0)] bg-[size:20px_20px] dark:bg-zinc-950 dark:bg-[radial-gradient(circle_at_1px_1px,#27272a_1px,transparent_0)]",
            "relative min-h-0 flex-1 overflow-hidden",
            isStudio && "h-full w-full",
              (spacePan || handPan) && !isPanning && "cursor-grab",
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
              placeAt(
                pointerToSvg({
                  clientX: event.clientX,
                  clientY: event.clientY,
                }),
                next,
                { shiftKey: event.shiftKey },
              )
            } catch {
              /* ignore */
            }
          }}
        >
          <VenueCanvasErrorBoundary onReset={clearTransientSelection}>
          <svg
            ref={svgRef}
            viewBox={`${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.width} ${svgViewBox.height}`}
            preserveAspectRatio="xMidYMid meet"
            className={cn(
              "w-full touch-none select-none",
              "absolute inset-0 z-0 h-full min-h-0",
              tool === "polygon" && "cursor-crosshair",
              (spacePan || handPan || isPanning) && tool !== "polygon" && "cursor-grab",
              isPanning && "cursor-grabbing",
              transformingKind === "move" && "cursor-grabbing",
              transformingKind === "rotate" && "cursor-grabbing",
              transformingKind === "scale" &&
                (scaleHandle === "n" || scaleHandle === "s"
                  ? "cursor-ns-resize"
                  : scaleHandle === "e" || scaleHandle === "w"
                    ? "cursor-ew-resize"
                    : scaleHandle === "ne" || scaleHandle === "sw"
                      ? "cursor-nesw-resize"
                      : "cursor-nwse-resize"),
            )}
            onContextMenu={handleInventoryContextMenu}
            onPointerDown={handleInventoryPointerDown}
            onDoubleClick={handleInventoryDoubleClick}
            onPointerOver={handleInventoryPointerOver}
            onPointerOut={handleInventoryPointerOut}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onPointerCancel={onPointerUp}
          >
            <TheatreSeatDefs />
            <g ref={sceneGroupRef}>
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
              <VenueMapGridLayer
                x={-80}
                y={-80}
                width={CANVAS.width + 160}
                height={CANVAS.height + 160}
                visible={!preview}
              />
              <VenueMapZoneLayer
                zones={unselectedZones}
                selectedId={null}
                emphasizeSelected={false}
                focusedZoneId={activeZoneId}
                draft={polygonDraft}
                cursor={null}
                zoom={zoom}
                onSelect={
                  tool === "polygon"
                    ? undefined
                    : (zone) => {
                        setIsolationId(null)
                        if (vertexEditZoneId && vertexEditZoneId !== zone.id) {
                          exitZoneVertexEdit()
                        }
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
                        enterZoneVertexEdit(zone)
                      }
                }
                onContextMenu={(event, zone) =>
                  openObjectMenu(event, { kind: "zone", id: zone.id })
                }
              />
              {map.aisles
                .filter((aisle) => aisle.id !== selectedAisle?.id)
                .map((aisle) => (
                  <VenueAisleNode
                    key={aisle.id}
                    aisle={aisle}
                    selected={false}
                    dimmed={Boolean(activeZoneId)}
                    hitDisabled={!objectHitsEnabled}
                    onContextMenu={(event) => openObjectMenu(event, { kind: "aisle", id: aisle.id })}
                    onPointerDown={
                      objectHitsEnabled
                        ? (event) => {
                            if (activeZoneId) return
                            if (wantsCanvasPan(event)) return
                            event.stopPropagation()
                            if (event.button !== 0) return
                            setIsolationId(null)
                            setHandPan(false)
                            setPlacement(null)
                            setTool("select")
                            setSelection({ kind: "aisle", id: aisle.id })
                            beginElementDrag("aisle", event, aisle.x, aisle.y, aisle.id)
                          }
                        : undefined
                    }
                  />
                ))}
              {map.stage && selection?.kind !== "stage" ? (
                <VenueStageNode
                  stage={map.stage}
                  selected={false}
                  dimmed={Boolean(activeZoneId)}
                  hitDisabled={!objectHitsEnabled}
                  onContextMenu={(event) => openObjectMenu(event, { kind: "stage" })}
                  onPointerDown={
                    objectHitsEnabled
                      ? (event) => {
                          if (activeZoneId) return
                          if (wantsCanvasPan(event)) return
                          event.stopPropagation()
                          if (event.button !== 0) return
                          setIsolationId(null)
                          setHandPan(false)
                          setPlacement(null)
                          setTool("select")
                          setSelection({ kind: "stage" })
                          if (map.stage) {
                            beginElementDrag("stage", event, map.stage.x, map.stage.y)
                          }
                        }
                      : undefined
                  }
                />
              ) : null}
              <VenueSectorSeatLayer
                sectors={renderMap.sectors ?? []}
                selectedSectorId={selectedSectorId}
                selectedSeatKeys={selectedSeatKeys}
                filterKeys={liveSeatKeys}
                filterMode="exclude"
                showLabels={showSeatLabels}
                hitsEnabled={objectHitsEnabled}
                activeZone={activeZone}
                occupancyBySeatId={occupancyBySeatId}
              />
              <VenueMapElementLayer
                elements={unselectedElements}
                selectedIds={EMPTY_ELEMENT_IDS}
                interactive={objectHitsEnabled}
                delegateEvents
                showSeats={showElementSeats}
                zoom={zoom}
                popSelected={false}
                isolationDimIds={isolationDimElementIds}
                selectedSeatIds={selectedRawSeatIds}
                occupancyBySeatId={occupancyBySeatId}
                allowSoldHits
              />
              </g>
              <g transform={liveTransformToSvg(liveTransform)}>
                {selectedAisle ? (
                  <VenueAisleNode
                    aisle={selectedAisle}
                    selected
                    dimmed={Boolean(activeZoneId)}
                    onContextMenu={(event) =>
                      openObjectMenu(event, { kind: "aisle", id: selectedAisle.id })
                    }
                    hitDisabled={!objectHitsEnabled}
                    onPointerDown={
                      objectHitsEnabled
                        ? (event) => {
                            if (activeZoneId) return
                            if (wantsCanvasPan(event)) return
                            event.stopPropagation()
                            if (event.button !== 0) return
                            beginGroupMove([], event)
                          }
                        : undefined
                    }
                  />
                ) : null}
                {selectedStage ? (
                  <VenueStageNode
                    stage={selectedStage}
                    selected
                    dimmed={Boolean(activeZoneId)}
                    hitDisabled={!objectHitsEnabled}
                    onContextMenu={(event) => openObjectMenu(event, { kind: "stage" })}
                    onPointerDown={
                      objectHitsEnabled
                        ? (event) => {
                            if (activeZoneId) return
                            if (wantsCanvasPan(event)) return
                            event.stopPropagation()
                            if (event.button !== 0) return
                            beginGroupMove([], event)
                          }
                        : undefined
                    }
                  />
                ) : null}
                <VenueSectorSeatLayer
                  sectors={renderMap.sectors ?? []}
                  selectedSectorId={selectedSectorId}
                  selectedSeatKeys={selectedSeatKeys}
                  filterKeys={liveSeatKeys}
                  filterMode="include"
                  showLabels={showSeatLabels}
                  hitsEnabled={objectHitsEnabled}
                  activeZone={activeZone}
                  occupancyBySeatId={occupancyBySeatId}
                />
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
                    zoom={zoom}
                    editVertices={vertexEditZoneId === selectedZone.id}
                    onVertexPointerDown={beginVertexDrag}
                    onDoubleClick={
                      tool === "polygon"
                        ? undefined
                        : (event, zone) => {
                            isolateCanvasPointer(event)
                            enterZoneVertexEdit(zone)
                          }
                    }
                    onContextMenu={(event, zone) =>
                      openObjectMenu(event, { kind: "zone", id: zone.id })
                    }
                  />
                ) : null}
                <g ref={selectedVisualRef}>
                  <VenueMapElementLayer
                    elements={selectedRenderElements}
                    selectedIds={selectedElementIds}
                    interactive={objectHitsEnabled}
                    delegateEvents
                    showSeats={showElementSeats}
                    zoom={zoom}
                    popSelected={false}
                    isolationDimIds={isolationDimElementIds}
                    selectedSeatIds={selectedRawSeatIds}
                    occupancyBySeatId={occupancyBySeatId}
                    allowSoldHits
                  />
                </g>
                {transformBounds &&
                !geometryLocked &&
                objectHitsEnabled &&
                !vertexEditZoneId ? (
                  <SvgTransformBox
                    bounds={transformBounds}
                    zoom={zoom}
                    grabbing={transformingKind === "move"}
                    isRotating={transformingKind === "rotate"}
                    fatFinger={compactChrome}
                    locked={selectionLocked}
                    hideResize={selection?.kind === "seats"}
                    onMoveStart={(event) => {
                      if (selectedZone) {
                        beginGroupMove([], event, selectedZone.id)
                        return
                      }
                      if (
                        selectedStage ||
                        selectedAisle ||
                        seatGizmoActive ||
                        selectedSeatEntries.length > 0
                      ) {
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
              {(map.labels ?? []).map((label) => (
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
              <PolygonCursorOverlay
                cursorRef={polygonCursorRef}
                lineRef={polygonLineRef}
                closeRingRef={polygonCloseRef}
              />
            </g>
          </svg>
          </VenueCanvasErrorBoundary>
          {activeZoneId && !preview ? (
            <button
              type="button"
              onClick={exitZoneIsolation}
              className="absolute top-4 left-4 z-40 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-zinc-800"
            >
              Volver al mapa general
            </button>
          ) : null}
          {!preview && !libraryOpen ? (
            <VenueFloatingToolbar
              active={floatingTool}
              onChange={pickFloatingTool}
              geometryLocked={geometryLocked}
              constraintRef={canvasRef}
              className={compactChrome ? "top-16" : undefined}
            />
          ) : null}
          {!preview && !libraryOpen ? (
            <div className="absolute top-4 right-4 z-40" data-editor-chrome>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card/85 px-3 text-xs font-semibold text-foreground shadow-lg backdrop-blur-md hover:bg-card"
                >
                  Herramientas
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  {geometryLocked ? null : (
                    <>
                      <DropdownMenuItem onClick={addStage}>
                        <Square className="size-4" />
                        Agregar escenario
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={addAisle}>
                        <Minus className="size-4" />
                        Agregar pasillo
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setLibraryOpen(true)}
                      >
                        <LayoutTemplate className="size-4" />
                        Plantillas
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      setTemplateName(eventTitle || "Mi recinto")
                      setSaveOpen(true)
                    }}
                    disabled={pendingTemplates}
                  >
                    <Save className="size-4" />
                    Guardar como plantilla
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openPreview}>
                    <Eye className="size-4" />
                    Vista previa del comprador
                  </DropdownMenuItem>
                  {geometryLocked ? null : (
                    <DropdownMenuItem onClick={handleClearMap}>
                      <Trash2 className="size-4" />
                      Limpiar Mapa
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
          {isStudio && tool !== "polygon" ? (
            <VenueStudioHud
              map={map}
              className={compactChrome ? "top-3 bottom-auto left-1/2 -translate-x-1/2" : undefined}
            />
          ) : null}
          {!preview ? (
            <div
              className={cn(
                "pointer-events-none absolute left-1/2 z-40 -translate-x-1/2",
                compactChrome ? "bottom-24" : "bottom-6",
              )}
            >
              <div
                data-editor-chrome
                className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-border bg-card/80 px-2 py-1 text-foreground shadow-lg backdrop-blur-md"
              >
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => nudgeCanvasZoom(-0.1)}
                  className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Alejar"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="min-w-12 text-center text-xs font-semibold tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => nudgeCanvasZoom(0.1)}
                  className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Acercar"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>
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
              placement={toolbarCss.placement}
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
                : selectedNode
                  ? "Propiedades"
                  : "Propiedades del lienzo"
          }
          description={
            workMode === "pricing"
              ? "Precio y color en el panel. El mapa sigue visible arriba."
              : workMode === "indexing"
                ? "Numeración de filas y asientos del bloque seleccionado."
                : selectedNode
                  ? "Editá el elemento. El plano queda visible arriba."
                  : "Foto de fondo, opacidad y encaje del recinto."
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
            <ConcentricRingGenerator
              key={
                ringCenter
                  ? `${Math.round(ringCenter.x)}:${Math.round(ringCenter.y)}`
                  : "default"
              }
              onGenerate={applyGeneratedRing}
              center={ringCenter}
            />
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
            <div className="space-y-3">
              <Button
                type="button"
                variant={vertexEditZoneId === selectedZone.id ? "secondary" : "outline"}
                className="w-full"
                onClick={() => {
                  if (vertexEditZoneId === selectedZone.id) {
                    exitZoneVertexEdit()
                    return
                  }
                  enterZoneVertexEdit(selectedZone)
                }}
              >
                <CircleDot className="size-4" />
                {vertexEditZoneId === selectedZone.id
                  ? "Listo con los nodos"
                  : "Editar nodos"}
              </Button>
              {vertexEditZoneId === selectedZone.id ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Arrastrá cada círculo para mover ese vértice. El resto de la
                  zona no se transforma.
                </p>
              ) : null}
              <VenueParametricRulesPanel
                zone={selectedZone}
                autoFocusName={rulesFocusId === selectedZone.id}
                onChange={(patch) => patchZone(selectedZone.id, patch)}
              />
            </div>
          ) : selectedSector ? (
            <div className="space-y-3">
              <Accordion
                multiple
                defaultValue={["datos", "distribucion"]}
                className="rounded-xl border border-border px-3"
              >
                <AccordionItem value="datos" className="border-border">
                  <AccordionTrigger className="py-2.5 text-xs font-semibold tracking-wide uppercase hover:no-underline">
                    Datos
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    <Field label="Nombre del sector">
                      <Input
                        value={selectedSector.name}
                        onChange={(event) =>
                          patchSector(selectedSector.id, { name: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Color del Sector">
                      <VenueSectorColorPicker
                        value={selectedSector.color}
                        onChange={(color) =>
                          patchSector(selectedSector.id, { color })
                        }
                      />
                    </Field>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="distribucion" className="border-border">
                  <AccordionTrigger className="py-2.5 text-xs font-semibold tracking-wide uppercase hover:no-underline">
                    Distribución
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    <Field label="Capacidad">
                      <Input
                        type="number"
                        min={1}
                        value={
                          selectedSector.seats.filter(
                            (seat) => seat.status !== "blocked",
                          ).length ||
                          rowsConfigGridFields(
                            resolveSectorRowsConfig(selectedSector, {
                              maxRows: 40,
                              maxSeats: 40,
                            }),
                          ).capacity
                        }
                        readOnly
                      />
                    </Field>
                    <Field label="Cantidad de filas">
                      <Input
                        type="number"
                        min={1}
                        max={40}
                        value={
                          resolveSectorRowsConfig(selectedSector, {
                            maxRows: 40,
                            maxSeats: 40,
                          }).length
                        }
                        onChange={(event) => {
                          const current = resolveSectorRowsConfig(selectedSector, {
                            maxRows: 40,
                            maxSeats: 40,
                          })
                          patchSector(selectedSector.id, {
                            rowsConfig: resizeRowsConfig(
                              current,
                              Number(event.target.value) || 1,
                              { maxRows: 40, maxSeats: 40 },
                            ),
                          })
                        }}
                      />
                    </Field>
                    <VenueRowsConfigEditor
                      rowsConfig={resolveSectorRowsConfig(selectedSector, {
                        maxRows: 40,
                        maxSeats: 40,
                      })}
                      maxRows={40}
                      maxSeats={40}
                      onChange={(rowsConfig) =>
                        patchSector(selectedSector.id, { rowsConfig })
                      }
                    />
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
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
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
              <InspectorShapeSelector
                element={selectedElement}
                onChange={(patch) => patchElement(selectedElement.id, patch)}
              />
              {selectedElement.type === "round_table" ||
              selectedElement.type === "vip_box" ? (
                <Field label="Cantidad de sillas">
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
              {selectedGroupId ? (
                <Field label="Nombre del sector">
                  <Input
                    value={selectedGroupName}
                    onChange={(event) => renameSelectedGroup(event.target.value)}
                  />
                </Field>
              ) : null}
              <Field label={selectedGroupId ? "Nombre de la mesa" : "Nombre"}>
                <Input
                  value={selectedElement.label}
                  onChange={(event) =>
                    patchElement(selectedElement.id, {
                      label: event.target.value,
                      customLabel: event.target.value.trim() || undefined,
                      labelLocked: true,
                    })
                  }
                />
              </Field>
              <Field label="Color del Sector">
                <div className="space-y-2">
                  <VenueSectorColorPicker
                    value={selectedElement.color}
                    onChange={(color) =>
                      patchElement(selectedElement.id, { color })
                    }
                  />
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
              {selectedGroupId ? (
                <Field label="Nombre del sector">
                  <Input
                    value={selectedGroupName}
                    onChange={(event) => renameSelectedGroup(event.target.value)}
                  />
                </Field>
              ) : null}
              <VenueBulkEditPanel
                elements={selectedElements}
                allElements={ensureElements(map)}
                selectedIds={selectedElementIds}
                tickets={tickets}
                onPrice={batchPrice}
                onColor={batchColor}
                onCapacity={batchCapacity}
                onCustomLabel={batchCustomLabel}
                onTicketType={batchTicketType}
                onApplyElements={applySelectedElements}
                showNumbering={false}
                showPricing={false}
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
          ) : selectedAisle ? (
            <div className="space-y-3">
              <Field label="Ancho (px)">
                <Input
                  type="number"
                  min={4}
                  value={selectedAisle.width}
                  onChange={(event) =>
                    commit({
                      ...mapRef.current,
                      aisles: (mapRef.current.aisles ?? []).map((aisle) =>
                        aisle.id === selectedAisle.id
                          ? {
                              ...aisle,
                              width: Math.max(4, Number(event.target.value) || 4),
                            }
                          : aisle,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Alto (px)">
                <Input
                  type="number"
                  min={4}
                  value={selectedAisle.height}
                  onChange={(event) =>
                    commit({
                      ...mapRef.current,
                      aisles: (mapRef.current.aisles ?? []).map((aisle) =>
                        aisle.id === selectedAisle.id
                          ? {
                              ...aisle,
                              height: Math.max(4, Number(event.target.value) || 4),
                            }
                          : aisle,
                      ),
                    })
                  }
                />
              </Field>
            </div>
          ) : selection?.kind === "label" ? (
            <Field label="Texto de nivel">
              <Input
                value={(map.labels ?? []).find((item) => item.id === selection.id)?.text ?? ""}
                onChange={(event) =>
                  commit({
                    ...map,
                    labels: (map.labels ?? []).map((item) =>
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
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Edición individual de esta silla. Los cambios no alteran el
                    resto del sector.
                  </p>
                  <Field label="Etiqueta personalizada (boleto)">
                    <Input
                      value={
                        singleSeat.seat.customLabel ??
                        singleSeat.seat.label ??
                        (singleSeat.source === "sector"
                          ? `Fila ${singleSeat.seat.row} - Asiento ${singleSeat.seat.number}`
                          : `${singleSeat.element.label} - Asiento ${singleSeat.seat.number}`)
                      }
                      onChange={(event) =>
                        patchSelectedSeats({
                          label: event.target.value,
                          customLabel: event.target.value.trim() || undefined,
                        })
                      }
                      aria-label="Etiqueta personalizada de ubicacion"
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
                  <Field label="Tipo de ticket">
                    <VenueTicketTypeSelect
                      tickets={tickets}
                      value={singleSeat.seat.ticketTypeId}
                      onChange={(ticket) =>
                        patchSelectedSeats({
                          ticketTypeId: ticket.id,
                          ...(ticket.price != null ? { price: ticket.price } : {}),
                        })
                      }
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
                  <Field label="Etiqueta personalizada (boleto)">
                    <Input
                      placeholder="Ej. Silla Preferencial VIP A"
                      onBlur={(event) => {
                        const next = event.target.value.trim()
                        if (!next) return
                        patchSelectedSeats({ label: next, customLabel: next })
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return
                        const next = event.currentTarget.value.trim()
                        if (!next) return
                        patchSelectedSeats({ label: next, customLabel: next })
                      }}
                    />
                  </Field>
                  <Field label="Estado">
                    <SeatStatusControl
                      onChange={(status) => patchSelectedSeats({ status })}
                    />
                  </Field>
                  <Field label="Tipo de ticket">
                    <VenueTicketTypeSelect
                      tickets={tickets}
                      onChange={(ticket) =>
                        patchSelectedSeats({
                          ticketTypeId: ticket.id,
                          ...(ticket.price != null ? { price: ticket.price } : {}),
                        })
                      }
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
                {singleSeat ? "Deshabilitar solo esta silla" : "Inhabilitar"}
              </Button>
              <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={restoreSelectedSeats}>
                {singleSeat ? "Reactivar esta silla" : "Reactivar seleccionadas"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {isStudio ? (
                <CanvasPropertiesInspector
                  map={map}
                  onChange={applyCanvasBackground}
                />
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Arrastrá componentes al plano. Clic izquierdo abre la ficha.
                  Clic derecho duplica, gira o borra.
                </p>
              )}
              {!isStudio ? (
                <>
                  <VenueMapBackgroundPanel
                    map={map}
                    onChange={(patch) => {
                      const current = mapRef.current
                      if (!current) return
                      commit({ ...current, ...patch })
                    }}
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
                        onChange={(event) => {
                          const current = mapRef.current
                          if (!current) return
                          commit({
                            ...current,
                            backgroundScale: Number(event.target.value) / 100,
                          })
                        }}
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

          {liveSelection ? (
            <Button
              type="button"
              className="w-full bg-red-600 text-white hover:bg-red-500"
              onClick={deleteSelection}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar selección
            </Button>
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
        <DialogContent className="w-[95vw] max-w-lg border-border bg-card text-foreground sm:max-w-lg">
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

function VenueStageNode({
  stage,
  selected,
  dimmed,
  hitDisabled,
  onContextMenu,
  onPointerDown,
}: {
  stage: VenueMapStage
  selected: boolean
  dimmed?: boolean
  hitDisabled?: boolean
  onContextMenu: (event: React.MouseEvent) => void
  onPointerDown?: (event: React.PointerEvent) => void
}) {
  const cx = stage.x + stage.width / 2
  const cy = stage.y + stage.height / 2
  const rotation = stage.rotation ?? 0
  return (
    <g
      className={
        dimmed || hitDisabled
          ? cn(
              "pointer-events-none",
              dimmed && "opacity-30 grayscale",
            )
          : undefined
      }
      transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
    >
      <rect
        x={stage.x}
        y={stage.y}
        width={stage.width}
        height={stage.height}
        rx={10}
        className={cn(
          "fill-slate-200 dark:fill-zinc-800",
          selected && "stroke-emerald-400",
        )}
        strokeWidth={selected ? 2 : 0}
      />
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        className="fill-slate-600 text-[13px] font-black tracking-[0.28em] dark:fill-[#e4e4e7]"
      >
        {stage.label}
      </text>
    </g>
  )
}

function VenueAisleNode({
  aisle,
  selected,
  dimmed,
  hitDisabled,
  onContextMenu,
  onPointerDown,
}: {
  aisle: VenueMapAisle
  selected: boolean
  dimmed?: boolean
  hitDisabled?: boolean
  onContextMenu: (event: React.MouseEvent) => void
  onPointerDown?: (event: React.PointerEvent) => void
}) {
  return (
    <rect
      x={aisle.x}
      y={aisle.y}
      width={aisle.width}
      height={aisle.height}
      rx={6}
      className={cn(
        "fill-zinc-800/80 stroke-zinc-600",
        selected && "stroke-emerald-400",
        dimmed && "pointer-events-none opacity-30 grayscale",
        hitDisabled && "pointer-events-none",
      )}
      strokeWidth={1.5}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
    />
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
