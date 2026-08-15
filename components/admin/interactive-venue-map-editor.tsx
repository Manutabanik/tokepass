"use client"

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowLeft,
  CircleDot,
  Copy,
  Eye,
  Hash,
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
  ZoomIn,
  ZoomOut,
  Armchair,
  PenTool,
  Send,
} from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { AutoNumberingPanel } from "@/components/admin/auto-numbering-panel"
import { BuyerViewModal } from "@/components/admin/buyer-view-modal"
import { ConcentricRingGenerator } from "@/components/admin/concentric-ring-generator"
import { QuickPriceAssigner } from "@/components/admin/quick-price-assigner"
import { VenueCanvasContextMenu } from "@/components/admin/venue-canvas-context-menu"
import { VenueComponentPalette, type PalettePlacement } from "@/components/admin/venue-component-palette"
import { VenueMapBackgroundPanel } from "@/components/admin/venue-map-background-panel"
import { VenueParametricRulesPanel } from "@/components/admin/venue-parametric-rules-panel"
import { VenueQuickInspector } from "@/components/admin/venue-quick-inspector"
import { VenueSetupGuide } from "@/components/admin/venue-setup-guide"
import { SvgTransformBox } from "@/components/admin/svg-transform-box"
import { InspectorShapeSelector } from "@/components/admin/inspector-shape-selector"
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
import { VenueMapZoneLayer } from "@/components/venue/venue-map-zone-layer"
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
  listVenuePriceGroups,
} from "@/lib/seating/venue-price-groups"
import {
  aabbIntersects,
  angleAt,
  bakeLiveTransform,
  clampScale,
  elementAabb,
  liveTransformToSvg,
  resizeOrigin,
  selectionBounds,
  translateElements,
  type BoundsRect,
  type LiveTransform,
  type ResizeHandle,
} from "@/lib/seating/venue-transform"
import {
  createVenueZone,
} from "@/lib/seating/adaptive-seating"
import {
  canvasPointToPercent,
  isCloseToFirstVertex,
  translatePercentPolygon,
  VENUE_MAP_CANVAS,
} from "@/lib/seating/venue-polygon"
import { applyAutoNumbering } from "@/lib/seating/auto-numbering"
import {
  rebuildSectorSeats,
  venueMapCapacity,
  venueMapHasInventory,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import { cn } from "@/lib/utils"
import {
  emptyVenueMap,
  parseVenueMap,
  isInfrastructureElement,
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
  onClose,
  onPreview,
  saving = false,
  variant = "card",
  eventTitle = "Mapa del recinto",
}: {
  value?: InteractiveVenueMap | null
  onChange: (map: InteractiveVenueMap, seatingLayout: VenueSeatingLayout) => void
  onSave?: (map: InteractiveVenueMap) => void
  onClose?: () => void
  onPreview?: () => void
  saving?: boolean
  variant?: "card" | "studio"
  eventTitle?: string
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
  const undoStack = useRef<InteractiveVenueMap[]>([])
  const redoStack = useRef<InteractiveVenueMap[]>([])
  const [historyTick, setHistoryTick] = useState(0)
  const [libraryOpen, setLibraryOpen] = useState(
    () => !venueMapHasInventory(parseVenueMap(value ?? emptyVenueMap())),
  )
  const [pricePanelOpen, setPricePanelOpen] = useState(false)
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
  const elementDrag = useRef<{
    kind: "stage" | "label" | "aisle" | "sector" | "element" | "pan"
    id?: string
    startX: number
    startY: number
    origX: number
    origY: number
    recorded?: boolean
  } | null>(null)
  const transformDrag = useRef<
    | { mode: "move"; ids: string[]; startX: number; startY: number }
    | {
        mode: "scale"
        ids: string[]
        ox: number
        oy: number
        startDist: number
        handle: ResizeHandle
      }
    | {
        mode: "rotate"
        ids: string[]
        cx: number
        cy: number
        startAngle: number
      }
    | null
  >(null)
  const [liveTransform, setLiveTransform] = useState<LiveTransform | null>(null)
  const liveTransformRef = useRef<LiveTransform | null>(null)
  const [scaleHandle, setScaleHandle] = useState<ResizeHandle | null>(null)

  useEffect(() => {
    if (!value) return
    const next = parseVenueMap(value)
    if (JSON.stringify(next) === JSON.stringify(mapRef.current)) return
    setMap(next)
    mapRef.current = next
  }, [value])

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
    setHistoryTick((tick) => tick + 1)
    mapRef.current = cleared
    setMap(cleared)
    onChange(cleared, venueMapToSeatingLayout(cleared))
    setSelection(null)
    setPolygonDraft([])
    setPolygonCursor(null)
    setPlacement(null)
    setMarquee(null)
    setLive(null)
    setMeasuredBounds(null)
  }

  function loadMap(next: InteractiveVenueMap, showPrices: boolean) {
    const parsed = parseVenueMap(next)
    undoStack.current = []
    redoStack.current = []
    setHistoryTick((tick) => tick + 1)
    mapRef.current = parsed
    setMap(parsed)
    onChange(parsed, venueMapToSeatingLayout(parsed))
    setLibraryOpen(false)
    setPricePanelOpen(
      showPrices && listVenuePriceGroups(parsed).length > 0,
    )
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
  const selectedElements = (map.elements ?? []).filter((item) =>
    selectedElementIds.includes(item.id),
  )
  const selectedIdSet = new Set(selectedElementIds)
  const unselectedElements = (map.elements ?? []).filter(
    (item) => !selectedIdSet.has(item.id),
  )
  const computedBounds =
    !preview && tool === "select" && !placement
      ? selectionBounds(selectedElements)
      : null
  const transformBounds = measuredBounds ?? computedBounds

  useLayoutEffect(() => {
    if (preview || tool !== "select" || placement || selectedElementIds.length === 0) {
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
      if (
        current &&
        Math.abs(current.x - next.x) < 0.05 &&
        Math.abs(current.y - next.y) < 0.05 &&
        Math.abs(current.width - next.width) < 0.05 &&
        Math.abs(current.height - next.height) < 0.05
      ) {
        return current
      }
      return next
    })
  }, [
    map.elements,
    placement,
    preview,
    selectedElementIds,
    selectedElements,
    tool,
    zoom,
  ])

  function setLive(next: LiveTransform | null) {
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
    if (live.type === "scale") return Math.abs(live.scale - 1) < 0.001
    return Math.abs(live.deg) < 0.05
  }

  function commitLiveTransform() {
    const live = liveTransformRef.current
    const drag = transformDrag.current
    if (!live || !drag || isIdentityLive(live)) {
      setLive(null)
      transformDrag.current = null
      setScaleHandle(null)
      return
    }
    const current = mapRef.current
    const selected = new Set(drag.ids)
    const baked = bakeLiveTransform(
      ensureElements(current).filter((item) => selected.has(item.id)),
      live,
    )
    const byId = new Map(baked.map((item) => [item.id, item]))
    commit({
      ...current,
      elements: ensureElements(current).map((item) => byId.get(item.id) ?? item),
    })
    setLive(null)
    transformDrag.current = null
    setScaleHandle(null)
  }

  function cancelLiveTransform() {
    setLive(null)
    transformDrag.current = null
    setScaleHandle(null)
  }

  function beginGroupMove(ids: string[], event: React.PointerEvent) {
    const point = pointerToSvg(event)
    capturePointer(event)
    transformDrag.current = {
      mode: "move",
      ids,
      startX: point.x,
      startY: point.y,
    }
    setLive({ type: "move", dx: 0, dy: 0 })
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
    transformDrag.current = {
      mode: "scale",
      ids: selectedElementIds,
      ox: origin.x,
      oy: origin.y,
      startDist: Math.max(startDist, 4),
      handle,
    }
    setLive({ type: "scale", ox: origin.x, oy: origin.y, scale: 1 })
    setScaleHandle(handle)
  }

  function beginRotate(bounds: BoundsRect, event: React.PointerEvent) {
    const point = pointerToSvg(event)
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2
    capturePointer(event)
    transformDrag.current = {
      mode: "rotate",
      ids: selectedElementIds,
      cx,
      cy,
      startAngle: angleAt({ x: cx, y: cy }, point),
    }
    setLive({ type: "rotate", cx, cy, deg: 0 })
  }

  function toggleElementSelection(id: string) {
    const next = selectedElementIds.includes(id)
      ? selectedElementIds.filter((item) => item !== id)
      : [...selectedElementIds, id]
    if (next.length === 0) setSelection(null)
    else if (next.length === 1) setSelection({ kind: "element", id: next[0]! })
    else setSelection({ kind: "elements", ids: next })
  }

  function onMapElementPointerDown(
    event: React.PointerEvent,
    element: VenueMapElement,
  ) {
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
      toggleElementSelection(target.id)
      return
    }
    const groupIds = selectedIdSet.has(target.id)
      ? selectedElementIds
      : [target.id]
    if (!selectedIdSet.has(target.id)) {
      setSelection({ kind: "element", id: target.id })
    }
    beginGroupMove(groupIds, event)
  }

  function pushHistory() {
    undoStack.current.push(structuredClone(mapRef.current))
    if (undoStack.current.length > 40) undoStack.current.shift()
    redoStack.current = []
    setHistoryTick((tick) => tick + 1)
  }

  function commit(next: InteractiveVenueMap, options?: { skipHistory?: boolean }) {
    if (!options?.skipHistory) pushHistory()
    mapRef.current = next
    setMap(next)
    onChange(next, venueMapToSeatingLayout(next))
  }

  function undo() {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(structuredClone(mapRef.current))
    setHistoryTick((tick) => tick + 1)
    commit(previous, { skipHistory: true })
  }

  function redo() {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(structuredClone(mapRef.current))
    setHistoryTick((tick) => tick + 1)
    commit(next, { skipHistory: true })
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

  function batchPrice(price: number) {
    const ids = new Set(selectedElementIds)
    if (ids.size === 0) return
    const current = mapRef.current
    commit({
      ...current,
      elements: ensureElements(current).map((item) =>
        ids.has(item.id) && !isInfrastructureElement(item)
          ? { ...item, price }
          : item,
      ),
    })
  }

  function batchPatchElements(
    patch: Partial<VenueMapElement>,
    commercialOnly = false,
  ) {
    const ids = new Set(selectedElementIds)
    if (ids.size === 0) return
    const current = mapRef.current
    commit({
      ...current,
      elements: ensureElements(current).map((item) => {
        if (!ids.has(item.id)) return item
        if (commercialOnly && isInfrastructureElement(item)) return item
        return { ...item, ...patch }
      }),
    })
  }

  function alignSelection(
    mode: "left" | "centerX" | "right" | "top" | "centerY" | "bottom",
  ) {
    if (selectedElements.length < 2) return
    const xs = selectedElements.map((item) => item.x)
    const ys = selectedElements.map((item) => item.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    const ids = new Set(selectedElementIds)
    const current = mapRef.current
    commit({
      ...current,
      elements: ensureElements(current).map((item) => {
        if (!ids.has(item.id)) return item
        if (mode === "left") return { ...item, x: minX }
        if (mode === "right") return { ...item, x: maxX }
        if (mode === "centerX") return { ...item, x: midX }
        if (mode === "top") return { ...item, y: minY }
        if (mode === "bottom") return { ...item, y: maxY }
        return { ...item, y: midY }
      }),
    })
  }

  function distributePrefixes() {
    if (selectedElementIds.length < 2) return
    const current = mapRef.current
    commit({
      ...current,
      elements: applyAutoNumbering(
        ensureElements(current),
        new Set(selectedElementIds),
        { start: 1, prefix: "Mesa ", suffix: "", direction: "ltr" },
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
    propertiesRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  function nudgeSelection(dx: number, dy: number) {
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

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (preview) return
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
    if (placement && !event.altKey && !spaceHeld.current) {
      placeAt(point)
      return
    }
    if ((event.altKey || spaceHeld.current) && !placement) {
      capturePointer(event)
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
    capturePointer(event)
    drag.current = { x: point.x, y: point.y }
    setMarquee({ x: point.x, y: point.y, w: 0, h: 0 })
    setSelection(null)
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
    const transforming = transformDrag.current
    if (transforming) {
      const point = pointerToSvg(event)
      if (transforming.mode === "move") {
        setLive({
          type: "move",
          dx: point.x - transforming.startX,
          dy: point.y - transforming.startY,
        })
        return
      }
      if (transforming.mode === "scale") {
        const dist = Math.hypot(point.x - transforming.ox, point.y - transforming.oy)
        setLive({
          type: "scale",
          ox: transforming.ox,
          oy: transforming.oy,
          scale: clampScale(dist / transforming.startDist),
        })
        return
      }
      setLive({
        type: "rotate",
        cx: transforming.cx,
        cy: transforming.cy,
        deg: angleAt({ x: transforming.cx, y: transforming.cy }, point) - transforming.startAngle,
      })
      return
    }
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
      if (!moving.recorded) {
        pushHistory()
        moving.recorded = true
      }
      const point = pointerToSvg(event)
      const dx = point.x - moving.startX
      const dy = point.y - moving.startY
      const nx = Math.round(moving.origX + dx)
      const ny = Math.round(moving.origY + dy)
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
    if (transformDrag.current) {
      commitLiveTransform()
      drag.current = null
      elementDrag.current = null
      setMarquee(null)
      return
    }
    if (marquee && marquee.w > 8 && marquee.h > 8) {
      const box = {
        minX: marquee.x,
        minY: marquee.y,
        maxX: marquee.x + marquee.w,
        maxY: marquee.y + marquee.h,
      }
      const elementIds = ensureElements(mapRef.current)
        .filter((item) => aabbIntersects(elementAabb(item), box))
        .map((item) => item.id)
      if (elementIds.length === 1) {
        setSelection({ kind: "element", id: elementIds[0]! })
      } else if (elementIds.length > 1) {
        setSelection({ kind: "elements", ids: elementIds })
      } else {
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
        if (ids.length > 0) setSelection({ kind: "seats", ids })
      }
    }
    drag.current = null
    elementDrag.current = null
    setMarquee(null)
  }

  function onPointerLeave() {
    if (tool === "polygon") setPolygonCursor(null)
    if (transformDrag.current || elementDrag.current) return
    onPointerUp()
  }

  const selectedSeatCount = selection?.kind === "seats" ? selection.ids.length : 0
  const capacity = useMemo(() => venueMapCapacity(map), [map])
  const canUndo = historyTick >= 0 && undoStack.current.length > 0
  const canRedo = historyTick >= 0 && redoStack.current.length > 0
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
      if (event.code === "Space") spaceHeld.current = false
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      spaceHeld.current = false
    }
  })

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      const delta = event.deltaY > 0 ? -0.08 : 0.08
      setZoom((value) => Math.min(3, Math.max(0.25, Number((value + delta).toFixed(2)))))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  function openPreview() {
    if (onPreview) onPreview()
    else setPreview(true)
  }

  const toolbar = (
    <div
      className={cn(
        "z-20 flex w-full items-center overflow-hidden border-b border-border bg-card",
        isStudio
          ? "shrink-0 flex-wrap gap-2 px-3 py-2"
          : "flex-wrap gap-2 px-3 py-2",
      )}
    >
      {isStudio ? (
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="shrink-0"
            aria-label="Salir sin guardar"
          >
            <ArrowLeft className="size-4" />
            Salir
          </Button>
          <p className="max-w-[160px] truncate text-sm font-semibold text-foreground">
            {eventTitle}
          </p>
        </div>
      ) : null}

      <div
        data-slot="button-group"
        className={cn(
          "inline-flex min-w-0 items-center rounded-lg border border-border bg-muted/40 p-0.5",
          isStudio && "scrollbar-none overflow-x-auto",
          !isStudio && "flex-wrap gap-1 border-0 bg-transparent p-0",
        )}
      >
        <ToolButton
          active={tool === "select"}
          onClick={() => {
            setTool("select")
            setPlacement(null)
          }}
          label="Select"
          showLabel
        >
          <MousePointer className="size-4" />
        </ToolButton>
        <ToolButton
          active={tool === "polygon"}
          onClick={() => {
            setTool("polygon")
            setPlacement({ kind: "zone_polygon" })
          }}
          label="Trazar zona"
          showLabel
        >
          <PenTool className="size-4" />
        </ToolButton>
        <ToolButton
          active={false}
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
          label="Zoom -"
          showLabel={false}
        >
          <ZoomOut className="size-4" />
        </ToolButton>
        <ToolButton
          active={false}
          onClick={() => setZoom((z) => Math.min(2.4, z + 0.1))}
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
            ? "ml-auto justify-end overflow-hidden"
            : "ml-auto flex-wrap",
        )}
      >
        {isStudio ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 whitespace-nowrap"
              onClick={handleClearMap}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Limpiar Mapa
            </Button>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 whitespace-nowrap"
              onClick={() => setLibraryOpen(true)}
            >
              <LayoutTemplate className="mr-2 h-4 w-4" />
              Plantillas
            </Button>
            <VenueSetupGuide compact />
            <Button
              type="button"
              variant="outline"
              className="shrink-0 whitespace-nowrap"
              disabled={pendingTemplates}
              onClick={() => {
                setTemplateName(eventTitle || "Mi recinto")
                setSaveOpen(true)
              }}
            >
              <Save className="mr-2 h-4 w-4" />
              Mi plantilla
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="shrink-0 whitespace-nowrap"
          onClick={openPreview}
        >
          <Eye className="mr-2 h-4 w-4 text-emerald-500" />
          Vista Previa del Comprador
        </Button>
        {onSave ? (
          <Button
            type="button"
            disabled={saving}
            onClick={() => onSave(map)}
            className="shrink-0 whitespace-nowrap bg-emerald-500 font-bold text-black hover:bg-emerald-400"
          >
            <Save className="mr-2 h-4 w-4" />
            Guardar Cambios
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
          isStudio
            ? "flex min-h-0 flex-1 overflow-hidden"
            : "grid lg:grid-cols-[220px_1fr_280px]",
        )}
      >
        <VenueComponentPalette
          variant={isStudio ? "studio" : "compact"}
          active={placement}
          onPick={(next) => {
            if (next.kind === "zone_polygon") {
              setPlacement(next)
              setTool("polygon")
              setPolygonDraft([])
              return
            }
            setPlacement(next)
            setTool("select")
          }}
        />
        <div
          ref={canvasRef}
          className={cn(
            "relative overflow-hidden bg-background bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] bg-[size:20px_20px]",
            isStudio ? "min-h-0 flex-1" : "min-h-[420px] bg-zinc-950",
          )}
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
            className={cn(
              "w-full touch-none",
              isStudio ? "h-full" : "h-[min(70vh,560px)]",
              tool === "polygon" && "cursor-crosshair",
              liveTransform?.type === "move" && "cursor-grabbing",
              liveTransform?.type === "rotate" && "cursor-grabbing",
              liveTransform?.type === "scale" &&
                (scaleHandle === "ne" || scaleHandle === "sw"
                  ? "cursor-nesw-resize"
                  : "cursor-nwse-resize"),
            )}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
          >
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              <rect width={CANVAS.width} height={CANVAS.height} fill="transparent" />
              <VenueMapBackgroundLayer map={map} />
              <VenueMapZoneLayer
                zones={map.zones ?? []}
                selectedId={selection?.kind === "zone" ? selection.id : null}
                draft={polygonDraft}
                cursor={tool === "polygon" ? polygonCursor : null}
                onSelect={
                  tool === "polygon"
                    ? undefined
                    : (zone) => setSelection({ kind: "zone", id: zone.id })
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
              {map.sectors.map((sector) => (
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
                elements={unselectedElements}
                selectedIds={[]}
                showSeats={(map.elements?.length ?? 0) < 220}
                zoom={zoom}
                popSelected={false}
                onElementPointerDown={onMapElementPointerDown}
                onElementContextMenu={(event, element) =>
                  openObjectMenu(event, { kind: "element", id: element.id })
                }
              />
              <g transform={liveTransformToSvg(liveTransform)}>
                <g ref={selectedVisualRef}>
                  <VenueMapElementLayer
                    elements={selectedElements}
                    selectedIds={selectedElementIds}
                    showSeats={(map.elements?.length ?? 0) < 220}
                    zoom={zoom}
                    popSelected={false}
                    onElementPointerDown={onMapElementPointerDown}
                    onElementContextMenu={(event, element) =>
                      openObjectMenu(event, { kind: "element", id: element.id })
                    }
                  />
                </g>
                {transformBounds ? (
                  <SvgTransformBox
                    bounds={transformBounds}
                    zoom={zoom}
                    grabbing={liveTransform?.type === "move"}
                    onMoveStart={(event) => {
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
                  className="fill-primary/10 stroke-primary"
                  strokeDasharray="4 3"
                />
              ) : null}
            </g>
          </svg>
          {isStudio && tool !== "polygon" ? <VenueStudioHud map={map} /> : null}
          {tool === "polygon" ? (
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 w-[min(100%-1.5rem,28rem)] -translate-x-1/2 rounded-full border border-cyan-400/30 bg-zinc-950/90 px-4 py-2 text-center text-xs text-cyan-100">
              Clic: vértice. Clic en el primero, Enter o doble clic: cerrar. Escape: cancelar.
            </div>
          ) : null}
          {pricePanelOpen ? (
            <QuickPriceAssigner
              map={map}
              onChange={(next) => commit(next)}
              onClose={() => setPricePanelOpen(false)}
            />
          ) : null}
          {selection && selection.kind !== "seats" && selection.kind !== "elements" ? (
            <VenueQuickInspector
              className="absolute right-3 top-3 z-20"
              element={selectedElement}
              sector={selectedSector}
              title={
                selection.kind === "stage"
                  ? "Escenario"
                  : selection.kind === "label"
                    ? "Etiqueta"
                    : selection.kind === "aisle"
                      ? "Pasillo"
                      : selection.kind === "zone"
                        ? "Zona paramétrica"
                        : undefined
              }
              subtitle={
                selection.kind === "stage"
                  ? map.stage?.label
                  : selection.kind === "label"
                    ? map.labels.find((item) => item.id === selection.id)?.text
                    : selection.kind === "aisle"
                      ? "Circulación"
                      : selection.kind === "zone"
                        ? selectedZone?.name
                        : undefined
              }
              price={selectedZone?.price}
              canPrice={
                Boolean(selectedSector) ||
                Boolean(selectedZone) ||
                Boolean(selectedElement && !isInfrastructureElement(selectedElement))
              }
              canRotate={Boolean(selectedElement)}
              canDuplicate={selection.kind !== "stage"}
              onPriceChange={(price) => {
                if (selectedElement && !isInfrastructureElement(selectedElement)) {
                  patchElement(selectedElement.id, { price })
                } else if (selectedSector) {
                  patchSector(selectedSector.id, { price })
                } else if (selectedZone) {
                  patchZone(selectedZone.id, { price })
                }
              }}
              onEdit={focusProperties}
              onDuplicate={() => duplicateTarget(selection)}
              onRotate={() =>
                selectedElement ? rotateSelection(90, [selectedElement.id]) : undefined
              }
              onDelete={deleteSelection}
            />
          ) : null}
        </div>

        <aside
          ref={propertiesRef}
          className={cn(
            "flex flex-col border-border bg-card",
            isStudio
              ? "h-full w-80 shrink-0 overflow-hidden border-l"
              : "space-y-4 overflow-y-auto border-t bg-card/50 p-4 lg:max-h-[min(70vh,560px)] lg:border-t-0 lg:border-l",
          )}
        >
          {isStudio ? (
            <div className="shrink-0 border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                {selection?.kind === "elements"
                  ? `${selection.ids.length} Elementos Seleccionados`
                  : selection
                    ? "Propiedades"
                    : "Predio"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selection?.kind === "elements"
                  ? "Los cambios se aplican a todo el grupo."
                  : selection
                    ? "Edición del elemento activo."
                    : "Foto aérea y medidas del recinto."}
              </p>
            </div>
          ) : (
            <div>
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
              isStudio ? "min-h-0 flex-1 space-y-4 overflow-y-auto p-4" : "contents",
            )}
          >
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
                    patchElement(selectedElement.id, { label: event.target.value })
                  }
                />
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
              <Field label="Sector / precio (ARS)">
                <PriceInput
                  value={selectedElement.price}
                  onValueChange={(value) => {
                    if (value == null) return
                    patchElement(selectedElement.id, { price: value })
                  }}
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
              <Field label="Aplicar precio a todos (ARS)">
                <PriceInput
                  value={undefined}
                  onValueChange={(value) => {
                    if (value == null) return
                    batchPrice(value)
                  }}
                />
              </Field>
              <Field label="Sector del grupo">
                <Input
                  value={
                    selectedElements.every(
                      (item) => item.sectorName === selectedElements[0]?.sectorName,
                    )
                      ? (selectedElements[0]?.sectorName ?? "")
                      : ""
                  }
                  placeholder="Nombre de sector"
                  onChange={(event) =>
                    batchPatchElements({ sectorName: event.target.value }, true)
                  }
                />
              </Field>
              <Field label="Color del grupo">
                <div className="flex items-center gap-2">
                  <Palette className="size-4 text-zinc-500" />
                  <input
                    type="color"
                    value={
                      selectedElements.every(
                        (item) => item.color === selectedElements[0]?.color,
                      )
                        ? (selectedElements[0]?.color ?? "#888888")
                        : "#888888"
                    }
                    onChange={(event) =>
                      batchPatchElements({ color: event.target.value })
                    }
                    className="h-8 w-full cursor-pointer rounded border border-zinc-700 bg-transparent"
                  />
                </div>
              </Field>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Alinear</p>
                <div className="grid grid-cols-3 gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
                    title="Alinear abajo"
                    onClick={() => alignSelection("bottom")}
                  >
                    <AlignEndHorizontal className="size-4" />
                    Abajo
                  </Button>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={distributePrefixes}>
                <Hash className="size-4" />
                Distribuir prefijos secuencialmente
              </Button>
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
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {isStudio
                  ? "Nada seleccionado. Arrastrá un recuadro en el plano para elegir varias mesas, o tocá un elemento para editarlo."
                  : "Arrastrá componentes al plano. Clic izquierdo abre la ficha. Clic derecho duplica, gira o borra."}
              </p>
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
          </div>
        </aside>
      </div>

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
            patchElement(target.id, { label: value.trim() })
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
  showLabel?: boolean
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      onClick={onClick}
      disabled={disabled}
      className={cn("h-9 shrink-0 gap-1.5", active && "ring-1 ring-emerald-500/40")}
    >
      {children}
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
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
