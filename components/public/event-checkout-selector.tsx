"use client"

import {
  AlertCircle,
  Clock,
  Info,
  Map,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { BundleCardSelector } from "@/components/public/bundle-card-selector"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { resolveTicketHighlightBadge } from "@/lib/checkout/ticket-picker"
import { resolveStockScarcity } from "@/lib/checkout/stock-scarcity"
import { formatCurrency } from "@/lib/format"
import { resolveSalePhases } from "@/lib/inventory/active-phase"
import {
  inferInventoryTierType,
  isQuantityInventoryType,
  type InventoryTierType,
} from "@/lib/inventory/unified-inventory"
import { cn, tapFeedbackClass } from "@/lib/utils"

export type SelectedNumberedSeat = {
  tierId: string
  seatingUnitId: string
  sectorKey: string | null
  tableNumber: number | null
  label: string
  price: number
}

type Props = {
  tiers: TicketSelectorTier[]
  quantities: Record<string, number>
  isPending: boolean
  hasSeatingFlow: boolean
  hasInteractiveMap?: boolean
  mapLoading?: boolean
  focusedTierId?: string | null
  selectedSeat: SelectedNumberedSeat | null
  selectedPlaceCount?: number
  includesGeneralAccess?: boolean
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatFlow: () => void
  onPurchaseIntent?: () => void
  onClearSeat: () => void
}

export function EventCheckoutSelector({
  tiers,
  quantities,
  isPending,
  hasSeatingFlow,
  hasInteractiveMap = false,
  mapLoading = false,
  focusedTierId = null,
  selectedSeat,
  selectedPlaceCount = 0,
  includesGeneralAccess = false,
  onQuantityChange,
  onOpenSeatFlow,
  onPurchaseIntent,
  onClearSeat,
}: Props) {
  const grouped = groupCheckoutTiers(tiers)
  const showSeatedCta = hasInteractiveMap || hasSeatingFlow
  const hasInventory =
    grouped.general.length > 0 ||
    grouped.bundle.length > 0 ||
    showSeatedCta

  if (!hasInventory) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay inventario disponible para este evento.
      </p>
    )
  }

  const placeLabel =
    selectedSeat?.label?.trim() ||
    (selectedPlaceCount > 0
      ? `${selectedPlaceCount} ${selectedPlaceCount === 1 ? "lugar" : "lugares"} en el mapa`
      : null)
  const generalQty = grouped.general.reduce(
    (sum, tier) => sum + (quantities[tier.id] ?? 0),
    0,
  )
  const showInclusionWarning =
    includesGeneralAccess && Boolean(placeLabel) && generalQty > 0

  return (
    <section className="space-y-5" aria-label="Elegí tu entrada">
      {showSeatedCta ? (
        placeLabel ? (
          <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Lugar reservado
                </p>
                {includesGeneralAccess ? (
                  <InclusionBadge />
                ) : null}
              </div>
              <p className="mt-1 break-words text-base font-extrabold text-foreground">
                {placeLabel}
              </p>
              {selectedSeat ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatCurrency(selectedSeat.price)} ·                   se confirma al
                  continuar. El reloj de 8 minutos corre en el proceso de compra.
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={onClearSeat}
              className={cn(tapFeedbackClass, "mt-3")}
            >
              Cambiar
            </Button>
          </div>
        ) : (
          <div className="group relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-6 transition-all hover:border-primary/40 hover:bg-primary/10 hover:shadow-lg">
            <Map
              className="pointer-events-none absolute -right-10 -bottom-10 size-48 text-foreground opacity-5 transition-opacity group-hover:opacity-10"
              aria-hidden="true"
            />
            <div className="relative space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xl font-bold tracking-tight text-foreground">
                  Asientos Numerados
                </p>
                {includesGeneralAccess ? <InclusionBadge /> : null}
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Tocá el plano o usá la búsqueda rápida para elegir mesas o
                butacas exactas.
              </p>
              <Button
                type="button"
                disabled={isPending || mapLoading}
                onClick={onOpenSeatFlow}
                className={cn(
                  tapFeedbackClass,
                  "w-full rounded-2xl py-4 text-lg font-bold shadow-md active:scale-95",
                )}
              >
                <Map className="size-5" aria-hidden="true" />
                {mapLoading ? "Cargando mapa…" : "Elegí lugares en el mapa"}
              </Button>
            </div>
          </div>
        )
      ) : null}

      {grouped.general.length > 0 ? (
        <QuantityList
          tiers={grouped.general}
          quantities={quantities}
          isPending={isPending}
          focusedTierId={focusedTierId}
          onQuantityChange={onQuantityChange}
        />
      ) : null}

      <InclusionWarning visible={showInclusionWarning} />

      {grouped.bundle.length > 0 ? (
        <BundleCardSelector
          bundles={grouped.bundle}
          quantities={quantities}
          isPending={isPending}
          onBuy={(tierId) => {
            const bundle = grouped.bundle.find((row) => row.id === tierId)
            onQuantityChange(tierId, 1, Math.max(0, bundle?.available ?? 1))
            onPurchaseIntent?.()
          }}
        />
      ) : null}
    </section>
  )
}

export function groupCheckoutTiers(tiers: TicketSelectorTier[]) {
  const buckets: Record<InventoryTierType, TicketSelectorTier[]> = {
    seated: [],
    general: [],
    addon: [],
    bundle: [],
  }
  for (const tier of tiers) {
    const type = inferInventoryTierType({
      tierType: tier.tierType,
      layoutType: tier.layoutType,
      category: tier.category,
      bundleItems: (tier.comboItems ?? []).map((item, index) => ({
        tierId: `${tier.id}-${index}`,
        quantity: item.quantity,
      })),
    })
    buckets[type].push(tier)
  }
  return buckets
}

function InclusionBadge() {
  return (
    <Badge className="border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/70 dark:text-amber-200">
      <Sparkles className="size-3" aria-hidden="true" />
      Incluye acceso general
    </Badge>
  )
}

function InclusionWarning({ visible }: { visible: boolean }) {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="inclusion-warning"
          initial={reduceMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-background/70 px-4 py-3 text-sm text-foreground shadow-sm backdrop-blur-md"
          >
            <Info
              className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
              aria-hidden="true"
            />
            <p>
              Tus lugares reservados ya incluyen acceso. Solo sumá entradas si
              vienen invitados extra.
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function QuantityList({
  tiers,
  quantities,
  isPending,
  focusedTierId = null,
  onQuantityChange,
  action = "stepper",
}: {
  tiers: TicketSelectorTier[]
  quantities: Record<string, number>
  isPending: boolean
  focusedTierId?: string | null
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  action?: "stepper" | "add"
}) {
  return (
    <ul className="space-y-3">
      {tiers.map((tier) => {
        const sale = resolveSalePhases(tier.phases)
        const current = sale.current
        const max = Math.max(0, tier.available)
        const quantity = quantities[tier.id] ?? 0
        const description = tier.description?.trim() || ""
        const highlight = resolveTicketHighlightBadge(tier, tiers)
        const unitPrice = current?.price ?? tier.price
        const phaseName = current?.name
        return (
          <li
            key={tier.id}
            className={cn(
              "rounded-2xl border border-border bg-background px-4 py-4 transition-all duration-300 ease-in-out",
              focusedTierId === tier.id && "ring-1 ring-primary/30",
              highlight === "bestseller" && "border-amber-400/35",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground">{tier.name}</p>
                  {highlight === "bestseller" ? (
                    <Badge
                      variant="secondary"
                      className="h-5 gap-1 border border-amber-400/30 bg-amber-400/15 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200"
                    >
                      <Sparkles className="size-3" aria-hidden="true" />
                      Más vendida
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-2xl font-black tracking-tight text-foreground">
                  {formatCurrency(unitPrice)}
                </p>
                {phaseName ? (
                  <p className="text-xs text-muted-foreground">{phaseName}</p>
                ) : null}
                {description ? (
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
                <StockHint
                  available={max}
                  capacity={tier.capacity}
                  sold={tier.sold}
                />
              </div>
              {action === "add" ? (
                <Button
                  type="button"
                  disabled={isPending || max === 0}
                  onClick={() =>
                    onQuantityChange(tier.id, Math.min(max, quantity + 1), max)
                  }
                  className={cn(tapFeedbackClass, "shrink-0 rounded-xl")}
                >
                  {quantity > 0 ? `Agregado · ${quantity}` : "Agregar"}
                </Button>
              ) : (
                <Stepper
                  value={quantity}
                  max={max}
                  disabled={isPending || max === 0}
                  onChange={(next) => onQuantityChange(tier.id, next, max)}
                />
              )}
            </div>
            {sale.upcoming.length > 0 ? (
              <ul className="mt-2 space-y-1 border-t border-border/70 pt-2">
                {sale.upcoming.map((phase) => (
                  <li
                    key={phase.id}
                    className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Clock className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {phase.name} - {formatCurrency(phase.price)}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium uppercase tracking-wide">
                      Próximamente
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function StockHint({
  available,
  capacity,
  sold,
}: {
  available: number
  capacity?: number
  sold?: number
}) {
  const scarcity = resolveStockScarcity(available, capacity, sold)
  if (scarcity.kind === "sold_out") {
    return (
      <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        <AlertCircle className="size-3.5" aria-hidden="true" />
        Agotado
      </p>
    )
  }
  if (scarcity.kind === "available") {
    return (
      <p className="mt-0.5 text-xs font-semibold text-emerald-500">
        Disponible
      </p>
    )
  }
  return (
    <p className="mt-0.5 text-xs font-semibold text-destructive motion-safe:animate-pulse">
      Últimos lugares disponibles
    </p>
  )
}

function Stepper({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number
  max: number
  disabled: boolean
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center rounded-full bg-secondary/30 p-1">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
        aria-label="Quitar"
        className={cn(tapFeedbackClass, "size-8 rounded-full hover:bg-secondary")}
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">
        {value}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Agregar"
        className={cn(tapFeedbackClass, "size-8 rounded-full hover:bg-secondary")}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

export function isQuantityTier(tier: TicketSelectorTier): boolean {
  return isQuantityInventoryType(
    inferInventoryTierType({
      tierType: tier.tierType,
      layoutType: tier.layoutType,
      category: tier.category,
    }),
  )
}
