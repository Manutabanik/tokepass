"use client"

import { Minus, Plus, Sparkles } from "lucide-react"
import { useMemo, useState } from "react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  ABSOLUTE_MAX_ITEMS_PER_PURCHASE,
  resolvePurchaseLimit,
} from "@/lib/checkout-limits"
import { formatCurrency } from "@/lib/format"
import {
  compactSeatToken,
  groupSeatsForMatrix,
} from "@/lib/seating/accessible-seat-matrix"
import {
  buildAccessibleSeatTree,
  type AccessibleSeatNode,
  type AccessibleSectorNode,
} from "@/lib/seating/accessible-seat-tree"
import {
  assignBestSeats,
  assignBestTableElements,
  countAvailableTables,
  previewFastAssign,
  type FastAssignMode,
} from "@/lib/seating/assign-best-seats"
import { flattenVenueMapSeats } from "@/lib/seating/venue-map-geometry"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { cn } from "@/lib/utils"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import type { StorefrontLayoutSeat } from "@/lib/stores/storefront-seat-store"
import type {
  InteractiveVenueMap,
  VenueMapElement,
  VenueMapZone,
} from "@/types/venue-map"

const GENERAL_TICKET_PREFIX = "ticket:"

function generalTicketOptionId(tierId: string) {
  return `${GENERAL_TICKET_PREFIX}${tierId}`
}

function parseGeneralTicketId(value: string): string | null {
  return value.startsWith(GENERAL_TICKET_PREFIX)
    ? value.slice(GENERAL_TICKET_PREFIX.length)
    : null
}

export function AccessibleSeatSelector({
  map,
  occupancyBySeatId = {},
  selectedSeatIds,
  selectedZoneId = null,
  unavailableZoneIds = [],
  pending = false,
  referenceImageUrl: _referenceImageUrl = null,
  onSelectZone,
  onToggleSeat,
  onAssignSeats,
  onAssignZoneQuantity,
  onAssignTables,
  generalTiers = [],
  onAssignGeneral,
  maxTicketsPerUser = null,
}: {
  map: InteractiveVenueMap
  occupancyBySeatId?: Record<string, SeatStatus>
  selectedSeatIds: string[]
  selectedZoneId?: string | null
  unavailableZoneIds?: string[]
  pending?: boolean
  referenceImageUrl?: string | null
  onSelectZone?: (zone: VenueMapZone) => void
  onToggleSeat: (seat: StorefrontLayoutSeat) => void
  onAssignSeats: (seats: StorefrontLayoutSeat[]) => void
  onAssignZoneQuantity: (sectorId: string, quantity: number) => void
  onAssignTables?: (tables: VenueMapElement[]) => void
  generalTiers?: TicketSelectorTier[]
  onAssignGeneral?: (tierId: string, quantity: number, max: number) => void
  maxTicketsPerUser?: number | null
}) {
  const purchaseCap =
    resolvePurchaseLimit(maxTicketsPerUser) ?? ABSOLUTE_MAX_ITEMS_PER_PURCHASE
  const selected = useMemo(() => new Set(selectedSeatIds), [selectedSeatIds])
  const sectors = useMemo(
    () =>
      buildAccessibleSeatTree({
        map,
        occupancyBySeatId,
        selectedSeatIds: selected,
        unavailableZoneIds,
      }),
    [map, occupancyBySeatId, selected, unavailableZoneIds],
  )
  const flatSeats = useMemo(() => flattenVenueMapSeats(map), [map])
  const numberedSectors = sectors.filter((sector) => sector.kind === "numbered")
  const ticketOptions = useMemo(
    () =>
      generalTiers.filter(
        (tier) => tier.layoutType === "general" && tier.available > 0,
      ),
    [generalTiers],
  )
  const [autoSectorId, setAutoSectorId] = useState(
    () =>
      ticketOptions[0]
        ? generalTicketOptionId(ticketOptions[0].id)
        : numberedSectors[0]?.id ?? sectors[0]?.id ?? "",
  )
  const selectedGeneralTier =
    ticketOptions.find(
      (tier) => generalTicketOptionId(tier.id) === autoSectorId,
    ) ??
    (parseGeneralTicketId(autoSectorId)
      ? ticketOptions.find((tier) => tier.id === parseGeneralTicketId(autoSectorId))
      : null)
  const [autoQuantity, setAutoQuantity] = useState(2)
  const [autoMode, setAutoMode] = useState<FastAssignMode>("SEATS")
  const [autoError, setAutoError] = useState<string | null>(null)
  const [autoHint, setAutoHint] = useState<string | null>(null)

  const autoSector =
    sectors.find((sector) => sector.id === autoSectorId) ?? sectors[0] ?? null

  function handleAssign() {
    if (pending) return
    if (selectedGeneralTier) {
      const max = Math.max(0, selectedGeneralTier.available)
      const quantity = Math.min(purchaseCap, Math.max(1, autoQuantity), max)
      if (quantity <= 0) {
        setAutoError("Esa entrada no tiene stock disponible.")
        return
      }
      setAutoError(null)
      setAutoHint(null)
      onAssignGeneral?.(selectedGeneralTier.id, quantity, max)
      return
    }
    if (!autoSector) return
    const quantity = Math.min(purchaseCap, Math.max(1, autoQuantity))
    const mode = autoSector.isTableSector ? autoMode : "SEATS"
    if (autoSector.kind === "ga") {
      if (autoSector.soldOut) {
        setAutoError("Ese sector no tiene lugares disponibles.")
        return
      }
      const preview = previewFastAssign({
        isTableSector: autoSector.isTableSector,
        mode,
        quantity,
        capacityPerUnit: autoSector.capacityPerUnit,
        unitPrice: autoSector.price,
        sellMode: autoSector.sellMode,
        unitNoun: autoSector.unitNoun,
      })
      setAutoError(null)
      setAutoHint(null)
      onAssignZoneQuantity(
        autoSector.id,
        autoSector.sellMode === "group"
          ? Math.max(1, preview.tableCount || 1)
          : Math.max(1, preview.seatCount || quantity),
      )
      return
    }
    if (autoSector.isTableSector && onAssignTables) {
      const tables = assignBestTableElements({
        map,
        sectorId: autoSector.id,
        sectorName: autoSector.name,
        count: quantity,
        occupancyBySeatId,
        selectedIds: selected,
      })
      if (tables.length > 0) {
        setAutoError(null)
        setAutoHint(null)
        onAssignTables(tables)
        return
      }
    }
    const found = assignBestSeats({
      seats: flatSeats,
      sectorId: autoSector.id,
      count: quantity,
      mode,
      isTableSector: autoSector.isTableSector,
      occupancyBySeatId,
      selectedSeatIds: selected,
    })
    if (found.length === 0) {
      setAutoError(
        mode === "FULL_TABLES"
          ? `No hay ${autoSector.unitNoun === "palco" ? "palcos completos" : "mesas completas"} disponibles para esa cantidad.`
          : "No hay asientos juntos en ese sector. Probá otra cantidad o sector.",
      )
      return
    }
    setAutoError(null)
    setAutoHint(null)
    onAssignSeats(
      found.map((seat) => ({
        id: seat.id,
        row: seat.row,
        number: seat.number,
        sectorId: seat.sectorId,
        sectorName: seat.sectorName,
        price: seat.price,
        color: seat.color,
        label: seat.label,
      })),
    )
  }

  return (
    <div className="w-full space-y-6 bg-transparent">
      <AutoAssignCard
        sectors={sectors}
        generalTiers={ticketOptions}
        purchaseCap={purchaseCap}
        seats={flatSeats}
        occupancyBySeatId={occupancyBySeatId}
        selectedSeatIds={selected}
        sectorId={autoSectorId}
        quantity={autoQuantity}
        mode={autoMode}
        error={autoError}
        hint={autoHint}
        pending={pending}
        onSectorChange={(value) => {
          setAutoSectorId(value)
          setAutoError(null)
          setAutoHint(null)
          const next = sectors.find((sector) => sector.id === value)
          if (!next?.isTableSector) setAutoMode("SEATS")
        }}
        onQuantityChange={(value) => {
          setAutoQuantity(value)
          setAutoError(null)
        }}
        onModeChange={(value) => {
          setAutoMode(value)
          setAutoError(null)
          setAutoHint(null)
        }}
        onHintChange={setAutoHint}
        onAssign={handleAssign}
      />

      {sectors.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay sectores publicados para elegir en lista.
        </p>
      ) : (
        <div className="space-y-4">
          {sectors.map((sector) => (
            <Accordion
              key={sector.id}
              multiple
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
              <AccordionItem value={sector.id} className="border-0 px-2">
                <AccordionTrigger className="min-h-12 px-4 py-4 hover:no-underline">
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="size-3.5 shrink-0 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: sector.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 text-left">
                      <span className="block truncate font-semibold text-foreground">
                        {sector.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {sector.soldOut
                          ? "Agotado"
                          : sector.kind === "ga"
                            ? formatCurrency(sector.price)
                            : `${sector.availableCount} libres · ${formatCurrency(sector.price)}`}
                      </span>
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {sector.kind === "ga" ? (
                    <div className="px-4 pb-6">
                      <p className="text-sm text-muted-foreground">
                        Acceso general. No hace falta elegir butaca.
                      </p>
                      <Button
                        type="button"
                        disabled={pending || sector.soldOut}
                        onClick={() => {
                          const zone = (map.zones ?? []).find(
                            (item) => item.id === sector.id,
                          )
                          if (zone) onSelectZone?.(zone)
                          else onAssignZoneQuantity(sector.id, 1)
                        }}
                        className="mt-4 h-auto w-full rounded-xl p-6 font-bold shadow-sm"
                      >
                        {selectedZoneId === sector.id
                          ? "Sector seleccionado"
                          : "Elegir este sector"}
                      </Button>
                    </div>
                  ) : (
                    <div className="px-4 pb-6">
                      {groupSeatsForMatrix(sector.rows).map((group, index) => (
                        <div key={group.title}>
                          <h4
                            className={cn(
                              "mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                              index === 0 ? "mt-1" : "mt-6",
                            )}
                          >
                            {group.title}
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {group.seats.map((seat) => (
                              <SeatMatrixButton
                                key={seat.id}
                                seat={seat}
                                groupTitle={group.title}
                                pending={pending}
                                onToggle={() => {
                                  const source = flatSeats.find(
                                    (item) => item.id === seat.id,
                                  )
                                  if (!source) return
                                  onToggleSeat({
                                    id: source.id,
                                    row: source.row,
                                    number: source.number,
                                    sectorId: source.sectorId,
                                    sectorName: source.sectorName,
                                    price: source.price,
                                    color: source.color,
                                    label: source.label,
                                  })
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ))}
        </div>
      )}
    </div>
  )
}

function SeatMatrixButton({
  seat,
  groupTitle,
  pending,
  onToggle,
}: {
  seat: AccessibleSeatNode
  groupTitle: string
  pending: boolean
  onToggle: () => void
}) {
  const token = compactSeatToken(seat.label, seat.number)
  const taken = seat.status === "occupied" || seat.status === "blocked"
  const selected = seat.status === "selected"
  const disabled = pending || taken

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={
        taken
          ? `${groupTitle} ${token} ocupado`
          : `${groupTitle} ${token}`
      }
      onClick={onToggle}
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-sm font-medium tabular-nums transition-colors",
        !disabled &&
          !selected &&
          "border border-input bg-background text-foreground hover:border-primary hover:bg-primary/10",
        selected &&
          "border border-primary bg-primary text-primary-foreground shadow-sm",
        taken &&
          "cursor-not-allowed border-transparent bg-muted text-muted-foreground opacity-50",
      )}
    >
      {token}
    </button>
  )
}

function AutoAssignCard({
  sectors,
  generalTiers = [],
  purchaseCap,
  seats,
  occupancyBySeatId,
  selectedSeatIds,
  sectorId,
  quantity,
  mode,
  error,
  hint,
  pending,
  onSectorChange,
  onQuantityChange,
  onModeChange,
  onHintChange,
  onAssign,
}: {
  sectors: AccessibleSectorNode[]
  generalTiers?: TicketSelectorTier[]
  purchaseCap: number
  seats: ReturnType<typeof flattenVenueMapSeats>
  occupancyBySeatId: Record<string, SeatStatus>
  selectedSeatIds: Set<string>
  sectorId: string
  quantity: number
  mode: FastAssignMode
  error: string | null
  hint: string | null
  pending: boolean
  onSectorChange: (sectorId: string) => void
  onQuantityChange: (quantity: number) => void
  onModeChange: (mode: FastAssignMode) => void
  onHintChange: (hint: string | null) => void
  onAssign: () => void
}) {
  const generalTier =
    generalTiers.find((tier) => generalTicketOptionId(tier.id) === sectorId) ??
    null
  const isGeneralTicket = Boolean(generalTier)
  const sector = isGeneralTicket
    ? null
    : sectors.find((item) => item.id === sectorId) ?? sectors[0] ?? null
  const isTable = Boolean(sector?.isTableSector) && !isGeneralTicket
  const capacity = Math.max(1, sector?.capacityPerUnit ?? 1)
  const unitNoun = sector?.unitNoun ?? "mesa"
  const unitPlural = unitNoun === "palco" ? "palcos" : "mesas"
  const activeMode = isTable ? mode : "SEATS"
  const availableTables = sector
    ? countAvailableTables({
        seats,
        sectorId: sector.id,
        occupancyBySeatId,
        selectedSeatIds,
      })
    : 0
  const maxQuantity = isTable
    ? activeMode === "FULL_TABLES"
      ? Math.max(
          1,
          Math.min(purchaseCap, availableTables || purchaseCap),
        )
      : capacity
    : Math.max(
        1,
        Math.min(
          purchaseCap,
          isGeneralTicket
            ? generalTier?.available || purchaseCap
            : sector?.availableCount || purchaseCap,
        ),
      )

  const unitPrice = isGeneralTicket
    ? generalTier?.price ?? 0
    : sector?.price ?? 0
  const preview = previewFastAssign({
    isTableSector: isTable,
    mode: activeMode,
    quantity,
    capacityPerUnit: capacity,
    unitPrice,
    sellMode: sector?.sellMode,
    unitNoun,
  })
  const generalNoun = /general/i.test(generalTier?.name ?? "")
    ? quantity === 1
      ? "General"
      : "Generales"
    : quantity === 1
      ? generalTier?.name ?? "entrada"
      : `${generalTier?.name ?? "entradas"}`
  const assignLabel = isGeneralTicket
    ? `Comprar ${quantity} ${generalNoun} por ${formatCurrency(quantity * unitPrice)}`
    : preview.buttonLabel

  function step(delta: number) {
    if (pending || (!sector && !isGeneralTicket)) return
    const next = quantity + delta
    if (
      isTable &&
      activeMode === "SEATS" &&
      delta > 0 &&
      quantity >= capacity
    ) {
      onModeChange("FULL_TABLES")
      onQuantityChange(Math.min(2, Math.max(1, availableTables || 2)))
      onHintChange(
        `Una ${unitNoun} admite hasta ${capacity} ${capacity === 1 ? "persona" : "personas"}. Pasamos a ${unitPlural} completas.`,
      )
      return
    }
    const clamped = Math.min(maxQuantity, Math.max(1, next))
    onQuantityChange(clamped)
    onHintChange(null)
  }

  function selectMode(nextMode: FastAssignMode) {
    if (nextMode === activeMode) return
    if (nextMode === "SEATS") {
      onQuantityChange(Math.min(2, capacity))
    } else {
      onQuantityChange(1)
    }
    onModeChange(nextMode)
    onHintChange(null)
  }

  const quantityLabel =
    isGeneralTicket
      ? quantity === 1
        ? "1 entrada"
        : `${quantity} entradas`
      : isTable && activeMode === "FULL_TABLES"
        ? quantity === 1
          ? `1 ${unitNoun}`
          : `${quantity} ${unitPlural}`
        : quantity === 1
          ? "1 persona"
          : `${quantity} personas`

  return (
    <section className="rounded-xl border border-primary/35 bg-primary/10 p-6 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-extrabold text-foreground">
        <Sparkles className="size-4 text-primary" aria-hidden="true" />
        Buscar el mejor lugar automáticamente
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {isGeneralTicket
          ? "Elegí el tipo de entrada y la cantidad. Se suma al carrito al instante."
          : isTable
            ? `Elegí si reservás por personas o por ${unitPlural} completas. Capacidad: ${capacity} ${capacity === 1 ? "persona" : "personas"} por ${unitNoun}.`
            : "Elegí cuántas personas y el sector. Asignamos lugares juntos si el plano tiene butacas."}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="block text-sm font-medium text-foreground">
          Cantidad
          <div className="mt-1 flex h-11 items-center rounded-xl border border-border bg-background">
            <button
              type="button"
              disabled={pending || quantity <= 1}
              onClick={() => step(-1)}
              className="grid size-11 shrink-0 place-items-center text-foreground transition hover:bg-secondary disabled:opacity-40"
              aria-label="Restar"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <p className="min-w-0 flex-1 text-center text-sm font-semibold tabular-nums">
              {quantityLabel}
            </p>
            <button
              type="button"
              disabled={pending || (activeMode === "SEATS" && isTable ? false : quantity >= maxQuantity)}
              onClick={() => step(1)}
              className="grid size-11 shrink-0 place-items-center text-foreground transition hover:bg-secondary disabled:opacity-40"
              aria-label="Sumar"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <label className="block text-sm font-medium text-foreground">
          Sector / Tipo de Entrada
          <select
            value={sectorId}
            disabled={pending || (sectors.length === 0 && generalTiers.length === 0)}
            onChange={(event) => onSectorChange(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground"
          >
            {generalTiers.length > 0 ? (
              <optgroup label="Entradas">
                {generalTiers.map((tier) => (
                  <option
                    key={generalTicketOptionId(tier.id)}
                    value={generalTicketOptionId(tier.id)}
                    disabled={tier.available <= 0}
                  >
                    {tier.name}
                    {tier.available <= 0 ? " (agotado)" : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {sectors.length > 0 ? (
              <optgroup label="Lugares del mapa">
                {sectors.map((item) => (
                  <option key={item.id} value={item.id} disabled={item.soldOut}>
                    {item.name}
                    {item.soldOut ? " (agotado)" : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
      </div>

      {isTable ? (
        <div
          className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-background/70 p-1"
          role="radiogroup"
          aria-label="Modo de reserva"
        >
          <button
            type="button"
            role="radio"
            aria-checked={activeMode === "SEATS"}
            disabled={pending}
            onClick={() => selectMode("SEATS")}
            className={cn(
              "rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition",
              activeMode === "SEATS"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground hover:bg-secondary",
            )}
          >
            <span className="block">Por personas</span>
            <span className="mt-0.5 block font-medium opacity-80">
              Somos {activeMode === "SEATS" ? quantity : Math.min(2, capacity)}{" "}
              {(activeMode === "SEATS" ? quantity : Math.min(2, capacity)) === 1
                ? "persona"
                : "personas"}
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={activeMode === "FULL_TABLES"}
            disabled={pending}
            onClick={() => selectMode("FULL_TABLES")}
            className={cn(
              "rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition",
              activeMode === "FULL_TABLES"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground hover:bg-secondary",
            )}
          >
            <span className="block">
              {unitNoun === "palco" ? "Palcos completos" : "Mesas completas"}
            </span>
            <span className="mt-0.5 block font-medium opacity-80">
              Quiero {activeMode === "FULL_TABLES" ? quantity : 1}{" "}
              {(activeMode === "FULL_TABLES" ? quantity : 1) === 1
                ? `${unitNoun} ${unitNoun === "palco" ? "entero" : "entera"}`
                : `${unitPlural} ${unitNoun === "palco" ? "enteros" : "enteras"}`}
            </span>
          </button>
        </div>
      ) : null}

      {preview.legend ? (
        <p
          className="mt-2 rounded-xl bg-primary/10 p-3 text-xs font-medium text-primary"
          role="status"
        >
          {preview.legend}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200" role="status">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-200" role="status">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        disabled={pending || !sectorId}
        onClick={onAssign}
        className="mt-4 h-auto w-full rounded-xl p-6 font-bold shadow-sm"
      >
        {assignLabel}
      </Button>
    </section>
  )
}
