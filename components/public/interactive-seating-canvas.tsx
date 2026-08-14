"use client"

import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Maximize2,
  Minimize2,
  RotateCcw,
  Trash2,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/format"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { flattenVenueMapSeats, type FlattenedVenueSeat } from "@/lib/seating/venue-map-geometry"
import {
  hexToRgba,
  resolveLiveVenueSeatStatus,
} from "@/lib/seating/venue-map-occupancy"
import { VenueMapBackgroundLayer } from "@/components/venue/venue-map-background-layer"
import { VenueMapElementLayer } from "@/components/venue/venue-map-element-layer"
import { VenueMapZoneLayer } from "@/components/venue/venue-map-zone-layer"
import { TheatreSeatSymbol } from "@/components/admin/venue-svg-symbols"
import { cn } from "@/lib/utils"
import { isInfrastructureElement } from "@/types/venue-map"
import type { InteractiveVenueMap, VenueMapZone } from "@/types/venue-map"

const VIEW = { width: 800, height: 560 }
const MIN_ZOOM = 0.7
const MAX_ZOOM = 3.2
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
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<SVGGElement>(null)
  const lastActivity = useRef(Date.now())
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
  })

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [expanded, setExpanded] = useState(false)
  const [wrapWidth, setWrapWidth] = useState(360)
  const [idleOpen, setIdleOpen] = useState(false)
  const [selectedSeats, setSelectedSeats] = useState<InteractiveSelectedSeat[]>(
    [],
  )
  const [hover, setHover] = useState<{
    x: number
    y: number
    text: string
  } | null>(null)

  const plotSeats = useMemo(() => {
    const zoneIds = new Set((map.zones ?? []).map((zone) => zone.id))
    return flattenVenueMapSeats(map).filter(
      (seat) => !zoneIds.has(seat.sectorId),
    )
  }, [map])
  const selectedIds = useMemo(
    () => new Set(selectedSeats.map((seat) => seat.id)),
    [selectedSeats],
  )
  const selectedElementIds = useMemo(() => {
    const ids = new Set(selectedSeats.map((seat) => seat.sectorId))
    for (const element of map.elements ?? []) {
      if (ids.has(element.id) || (element.groupId && ids.has(element.groupId))) {
        ids.add(element.id)
      }
    }
    return [...ids]
  }, [map.elements, selectedSeats])

  const subtotal = selectedSeats.reduce((sum, seat) => sum + seat.price, 0)
  const stageLabel = map.stage?.label?.trim() || "ESCENARIO"
  const pxPerUnit = (wrapWidth / VIEW.width) * zoom
  const hitRadius = Math.max(8, MIN_HIT_PX / 2 / Math.max(pxPerUnit, 0.05))

  useEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const sync = () => {
      const next = node.clientWidth || 360
      setWrapWidth((current) => (current === next ? current : next))
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => observer.disconnect()
  }, [expanded])

  useEffect(() => {
    if (disableIdlePrompt || selectedSeats.length === 0) {
      setIdleOpen(false)
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
    lastActivity.current = Date.now()
    setIdleOpen(false)
  }

  function applyWorld(nextPanX: number, nextPanY: number, nextZoom: number) {
    const node = worldRef.current
    if (node) {
      node.setAttribute(
        "transform",
        `translate(${nextPanX} ${nextPanY}) scale(${nextZoom})`,
      )
    }
    gesture.current.panX = nextPanX
    gesture.current.panY = nextPanY
    gesture.current.zoom = nextZoom
  }

  function commitView() {
    setPan({ x: gesture.current.panX, y: gesture.current.panY })
    setZoom(gesture.current.zoom)
  }

  function setView(nextZoom: number, nextPan = pan) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
    applyWorld(nextPan.x, nextPan.y, clamped)
    setZoom(clamped)
    setPan(nextPan)
    markActivity()
  }

  function resetView() {
    applyWorld(0, 0, 1)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    markActivity()
  }

  function seatPrice(sectorId: string, fallback: number) {
    const priced = priceBySectorId[sectorId]
    return Number.isFinite(priced) ? Number(priced) : fallback
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
    setSelectedSeats((current) => {
      if (current.some((item) => item.id === seat.id)) {
        return current.filter((item) => item.id !== seat.id)
      }
      return [
        {
          id: seat.id,
          row: seat.row,
          number: seat.number,
          sectorId: seat.sectorId,
          sectorName: seat.sectorName,
          price,
          color: seat.color,
        },
      ]
    })
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current.moved = false
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
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, gesture.current.startZoom * ratio),
      )
      applyWorld(gesture.current.panX, gesture.current.panY, nextZoom)
      gesture.current.moved = true
      return
    }

    if (gesture.current.pinching) return
    const dx = event.clientX - gesture.current.startX
    const dy = event.clientY - gesture.current.startY
    if (Math.abs(dx) + Math.abs(dy) > 8) gesture.current.moved = true
    applyWorld(
      gesture.current.startPanX + dx,
      gesture.current.startPanY + dy,
      gesture.current.zoom,
    )
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) gesture.current.pinching = false
    if (pointers.current.size === 0) {
      commitView()
      if (gesture.current.moved) markActivity()
    }
  }

  const continueLabel = pending ? "Reservando…" : "Continuar"
  const canContinue = selectedSeats.length === 1 && !pending

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

      <p className="mt-8 text-sm font-bold text-white">Tu selección</p>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {selectedSeats.length === 0 ? (
          <p className="text-base leading-relaxed text-zinc-400">
            Acercá el plano y tocá un círculo verde. Podés cambiar de butaca
            cuando quieras.
          </p>
        ) : (
          selectedSeats.map((seat) => (
            <div
              key={seat.id}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3"
            >
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: seat.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-white">
                  {seat.sectorName}
                </p>
                <p className="text-sm text-zinc-300">
                  Fila {seat.row} — Asiento {seat.number}
                </p>
              </div>
              <p className="text-sm font-semibold text-emerald-300">
                {formatCurrency(seat.price)}
              </p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-11 text-zinc-400 hover:text-white"
                onClick={() => {
                  vibrateTap()
                  setSelectedSeats((current) =>
                    current.filter((item) => item.id !== seat.id),
                  )
                  markActivity()
                }}
                aria-label={`Quitar fila ${seat.row}, asiento ${seat.number}`}
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
          "relative min-h-0 min-w-0 flex-1 md:w-[70%]",
        fillParent
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

      {onBack && fillParent ? (
        <div className="absolute top-3 left-3 z-20">
          <IconBtn label="Cerrar el plano" onClick={onBack}>
            <X className="size-5" />
          </IconBtn>
        </div>
      ) : null}

      <div className="absolute top-3 right-3 z-20 hidden flex-col gap-2 md:flex">
        <ZoomTextButton
          label="Acercar"
          hint="Ver más grande"
          onClick={() => setView(zoom + 0.25)}
        >
          <ZoomIn className="size-4" />
        </ZoomTextButton>
        <ZoomTextButton
          label="Alejar"
          hint="Ver todo el plano"
          onClick={() => setView(zoom - 0.25)}
        >
          <ZoomOut className="size-4" />
        </ZoomTextButton>
        <ZoomTextButton
          label="Restablecer"
          hint="Volver al inicio"
          onClick={resetView}
        >
          <RotateCcw className="size-4" />
        </ZoomTextButton>
        {fillParent ? null : (
          <ZoomTextButton
            label={expanded ? "Cerrar" : "Ampliar"}
            hint="Pantalla completa"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </ZoomTextButton>
        )}
      </div>

      <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5 md:hidden">
        <IconBtn label="Acercar el plano" onClick={() => setView(zoom + 0.25)}>
          <ZoomIn className="size-5" />
        </IconBtn>
        <IconBtn label="Alejar el plano" onClick={() => setView(zoom - 0.25)}>
          <ZoomOut className="size-5" />
        </IconBtn>
        <IconBtn label="Volver a ver todo el plano" onClick={resetView}>
          <RotateCcw className="size-5" />
        </IconBtn>
      </div>

      <div ref={wrapRef} className="h-full w-full">
        <svg
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          className="h-full w-full touch-none select-none"
          role="img"
          aria-label="Plano del recinto. Tocá un polígono de zona o una butaca."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setHover(null)}
        >
          <rect width={VIEW.width} height={VIEW.height} className="fill-zinc-950" />
          <g
            ref={worldRef}
            transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}
            style={{ willChange: "transform" }}
          >
            <VenueMapBackgroundLayer map={map} />
            <VenueMapZoneLayer
              zones={map.zones ?? []}
              selectedId={selectedZoneId}
              selectOnPointerUp
              onSelect={
                onSelectZone
                  ? (zone) => {
                      setSelectedSeats([])
                      onSelectZone(zone)
                    }
                  : undefined
              }
            />
            {map.aisles.map((aisle) => (
              <rect
                key={aisle.id}
                x={aisle.x}
                y={aisle.y}
                width={aisle.width}
                height={aisle.height}
                rx={8}
                className="fill-zinc-900 stroke-white/5"
              />
            ))}
            {map.stage ? (
              <rect
                x={map.stage.x}
                y={map.stage.y}
                width={map.stage.width}
                height={map.stage.height}
                rx={12}
                className="fill-violet-500/20 stroke-violet-400/50"
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
            <VenueMapElementLayer
              elements={(map.elements ?? []).filter(
                (element) => !isInfrastructureElement(element),
              )}
              occupancyBySeatId={occupancyBySeatId}
              selectedIds={selectedElementIds}
              selectedSeatIds={[...selectedIds]}
              showSeats
              zoom={zoom}
              onElementPointerDown={(event, element) => {
                event.stopPropagation()
                if (isInfrastructureElement(element)) return
                const match = plotSeats.find(
                  (seat) =>
                    seat.sectorId === element.id ||
                    seat.sectorId === element.groupId,
                )
                if (match) toggleSeat(match)
              }}
            />
            {plotSeats.map((seat) => {
              const price = seatPrice(seat.sectorId, seat.price)
              const live = resolveLiveVenueSeatStatus({
                mapStatus: seat.mapStatus,
                occupancy: occupancyBySeatId[seat.id],
                selected: selectedIds.has(seat.id),
              })
              const label = `Fila ${seat.row} — Asiento ${seat.number} — ${formatCurrency(price)}`
              return (
                <g key={seat.id}>
                  <circle
                    cx={seat.x}
                    cy={seat.y}
                    r={hitRadius}
                    fill="transparent"
                    className={
                      live === "occupied" || live === "blocked"
                        ? "cursor-not-allowed"
                        : "cursor-pointer"
                    }
                    aria-label={label}
                    role="button"
                    tabIndex={live === "occupied" || live === "blocked" ? -1 : 0}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      gesture.current.moved = false
                    }}
                    onPointerUp={(event) => {
                      event.stopPropagation()
                      if (gesture.current.moved) return
                      toggleSeat(seat)
                    }}
                    onPointerEnter={(event) => {
                      const box = wrapRef.current?.getBoundingClientRect()
                      if (!box) return
                      setHover({
                        x: event.clientX - box.left,
                        y: event.clientY - box.top,
                        text: label,
                      })
                    }}
                    onPointerLeave={() => setHover(null)}
                  />
                  {seat.source === "sector" ? (
                    <TheatreSeatSymbol
                      cx={seat.x}
                      cy={seat.y}
                      width={12}
                      height={12}
                      color={seat.color}
                      selected={live === "selected"}
                      occupied={live === "occupied" || live === "blocked"}
                      label={String(seat.number)}
                      showLabel={zoom >= 1.35}
                    />
                  ) : live === "selected" ? (
                    <circle
                      cx={seat.x}
                      cy={seat.y}
                      r={4.2}
                      fill="none"
                      stroke="#6ee7b7"
                      strokeWidth={1.6}
                      className="pointer-events-none"
                    />
                  ) : null}
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {hover ? (
        <div
          className="pointer-events-none absolute z-30 max-w-[min(90%,18rem)] rounded-2xl border border-white/15 bg-zinc-900/95 px-4 py-3 text-base font-semibold leading-snug text-white shadow-2xl"
          style={{ left: Math.min(hover.x + 12, wrapWidth - 12), top: hover.y + 16 }}
        >
          {hover.text}
        </div>
      ) : null}

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
    </div>
  )

  const shell = (
    <div
      className={cn(
        "relative flex w-full flex-col overflow-hidden bg-zinc-950 md:flex-row",
        fillParent
          ? "h-full min-h-0 rounded-none border-0 shadow-none"
          : expanded
            ? "fixed inset-0 z-[80] h-dvh rounded-none border-0"
            : "h-[600px] rounded-3xl border border-white/10 shadow-2xl md:h-[650px]",
      )}
    >
      {mapArea}
      {panel}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/90 px-3 py-2.5 backdrop-blur-xl md:hidden pb-[max(0.65rem,env(safe-area-inset-bottom))]",
          selectedZoneId && "hidden",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-white">
              {selectedSeats.length === 0
                ? "Elegí tu butaca"
                : formatCurrency(subtotal)}
            </p>
            <p className="truncate text-xs text-zinc-400">
              {selectedSeats[0]
                ? `Fila ${selectedSeats[0].row} · Asiento ${selectedSeats[0].number}`
                : "Zoom libre · un toque elige"}
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
    </div>
  )

  return (
    <>
      {shell}
      <Dialog
        open={idleOpen}
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

function ZoomTextButton({
  label,
  hint,
  onClick,
  children,
}: {
  label: string
  hint: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      aria-label={`${label}. ${hint}`}
      className="h-auto min-h-11 justify-start gap-2 border-white/10 bg-zinc-950/85 px-3 py-2 text-left text-zinc-100 hover:bg-zinc-800"
    >
      {children}
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-[11px] font-normal text-zinc-400">{hint}</span>
      </span>
    </Button>
  )
}
