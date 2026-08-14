"use client"

import {
  Armchair,
  Clock,
  LayoutGrid,
  Minus,
  Plus,
  Sparkles,
  Tag,
  Ticket,
} from "lucide-react"

import { BundleCardSelector } from "@/components/public/bundle-card-selector"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  resolveDefaultTicketPickerTab,
  resolveTicketHighlightBadge,
  ticketPickerTabLabel,
  type DefaultTicketTab,
} from "@/lib/checkout/ticket-picker"
import { formatCurrency } from "@/lib/format"
import { resolveSalePhases } from "@/lib/inventory/active-phase"
import {
  inferInventoryTierType,
  isQuantityInventoryType,
  type InventoryTierType,
} from "@/lib/inventory/unified-inventory"
import { seatingRenderModeCopy, type VenueRenderMode } from "@/lib/seating/adaptive-seating"
import { cn } from "@/lib/utils"

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
  seatingRenderMode?: VenueRenderMode
  selectedSeat: SelectedNumberedSeat | null
  showUpsell: boolean
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatFlow: () => void
  onPurchaseIntent?: () => void
  onClearSeat: () => void
  onAddUpsell: (tierId: string) => void
  onSkipUpsell: () => void
  defaultTicketTab?: DefaultTicketTab | null
}

export function EventCheckoutSelector({
  tiers,
  quantities,
  isPending,
  hasSeatingFlow,
  seatingRenderMode = "micro",
  selectedSeat,
  showUpsell,
  onQuantityChange,
  onOpenSeatFlow,
  onPurchaseIntent,
  onClearSeat,
  onAddUpsell,
  onSkipUpsell,
  defaultTicketTab = "auto",
}: Props) {
  const grouped = groupTiers(tiers)
  const mapCopy = seatingRenderModeCopy(seatingRenderMode)
  const tabs = (
    [
      hasSeatingFlow || grouped.seated.length > 0 ? "seated" : null,
      grouped.general.length > 0 ? "general" : null,
      grouped.bundle.length > 0 ? "bundle" : null,
      grouped.addon.length > 0 ? "addon" : null,
    ] as Array<InventoryTierType | null>
  ).filter((tab): tab is InventoryTierType => Boolean(tab))

  const defaultTab = resolveDefaultTicketPickerTab({
    tabs,
    grouped,
    configured: defaultTicketTab,
  })
  const upsellTier = grouped.addon.find(
    (tier) => (quantities[tier.id] ?? 0) === 0 && tier.available > 0,
  )

  if (tabs.length === 0) {
    return (
      <p className="mt-5 text-sm text-muted-foreground">
        No hay inventario disponible para este evento.
      </p>
    )
  }

  return (
    <div className="mt-5 space-y-4">
      <Tabs key={defaultTab} defaultValue={defaultTab} className="gap-3">
        <TabsList className="flex h-auto w-full flex-wrap rounded-lg bg-muted p-1">
          {tabs.includes("seated") ? (
            <TabsTrigger value="seated" className="min-h-10 flex-1 gap-1.5">
              <LayoutGrid className="size-3.5" />
              {ticketPickerTabLabel("seated", grouped.seated)}
            </TabsTrigger>
          ) : null}
          {tabs.includes("general") ? (
            <TabsTrigger value="general" className="min-h-10 flex-1 gap-1.5">
              <Ticket className="size-3.5" />
              {ticketPickerTabLabel("general", grouped.general)}
            </TabsTrigger>
          ) : null}
          {tabs.includes("bundle") ? (
            <TabsTrigger value="bundle" className="min-h-10 flex-1 gap-1.5">
              <Sparkles className="size-3.5" />
              {ticketPickerTabLabel("bundle", grouped.bundle)}
            </TabsTrigger>
          ) : null}
          {tabs.includes("addon") ? (
            <TabsTrigger value="addon" className="min-h-10 flex-1 gap-1.5">
              <Tag className="size-3.5" />
              {ticketPickerTabLabel("addon", grouped.addon)}
            </TabsTrigger>
          ) : null}
        </TabsList>

        {tabs.includes("seated") ? (
          <TabsContent value="seated" className="space-y-3">
            {selectedSeat ? (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {selectedSeat.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCurrency(selectedSeat.price)} · reservada al
                    continuar. El reloj de 8 minutos corre en el checkout.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={onClearSeat}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-4">
                <p className="text-sm text-foreground">{mapCopy.hint}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Al continuar, la ubicación queda reservada 8 minutos. Nombre,
                  DNI y teléfono se piden al pagar.
                </p>
                <Button
                  type="button"
                  className="mt-3"
                  disabled={isPending || !hasSeatingFlow}
                  onClick={onOpenSeatFlow}
                >
                  {seatingRenderMode === "micro" ? (
                    <Armchair className="size-4" />
                  ) : (
                    <LayoutGrid className="size-4" />
                  )}
                  {mapCopy.cta}
                </Button>
              </div>
            )}
          </TabsContent>
        ) : null}

        {tabs.includes("general") ? (
          <TabsContent value="general" className="space-y-3">
            {hasSeatingFlow ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LayoutGrid className="size-3.5 shrink-0" aria-hidden="true" />
                Estas entradas coinciden con las zonas de acceso del recinto.
              </p>
            ) : null}
            <QuantityList
              tiers={grouped.general}
              quantities={quantities}
              isPending={isPending}
              onQuantityChange={onQuantityChange}
            />
          </TabsContent>
        ) : null}

        {tabs.includes("bundle") ? (
          <TabsContent value="bundle" className="space-y-3">
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
          </TabsContent>
        ) : null}

        {tabs.includes("addon") ? (
          <TabsContent value="addon">
            <QuantityList
              tiers={grouped.addon}
              quantities={quantities}
              isPending={isPending}
              onQuantityChange={onQuantityChange}
            />
          </TabsContent>
        ) : null}
      </Tabs>

      {showUpsell && upsellTier ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="size-4" />
            Agregá {upsellTier.name} a tu orden por{" "}
            {formatCurrency(upsellTier.price)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Se reserva junto con el resto del carrito durante 8 minutos.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() => onAddUpsell(upsellTier.id)}
            >
              Agregar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={onSkipUpsell}
            >
              Seguir sin extra
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function groupTiers(tiers: TicketSelectorTier[]) {
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

function QuantityList({
  tiers,
  quantities,
  isPending,
  onQuantityChange,
}: {
  tiers: TicketSelectorTier[]
  quantities: Record<string, number>
  isPending: boolean
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
}) {
  return (
    <ul className="space-y-2">
      {tiers.map((tier) => {
        const sale = resolveSalePhases(tier.phases)
        const current = sale.current
        const max = Math.max(0, tier.available)
        const quantity = quantities[tier.id] ?? 0
        const description = tier.description?.trim() || ""
        const highlight = resolveTicketHighlightBadge(tier, tiers)
        const priceLabel = current
          ? `${current.name} - ${formatCurrency(current.price)}`
          : formatCurrency(tier.price)
        return (
          <li
            key={tier.id}
            className={cn(
              "rounded-2xl border bg-muted/30 px-3 py-3",
              highlight === "bestseller"
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{tier.name}</p>
                  {highlight === "bestseller" ? (
                    <Badge
                      variant="secondary"
                      className="h-5 gap-1 bg-amber-500/15 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200"
                    >
                      <Sparkles className="size-3" aria-hidden="true" />
                      Más vendida
                    </Badge>
                  ) : null}
                </div>
                {description ? (
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {priceLabel}
                  {max === 0 ? " · agotado" : ` · ${max} disponibles`}
                </p>
              </div>
              <Stepper
                value={quantity}
                max={max}
                disabled={isPending || max === 0}
                onChange={(next) => onQuantityChange(tier.id, next, max)}
              />
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
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
        aria-label="Quitar"
      >
        <Minus className="size-3.5" />
      </Button>
      <span className={cn("w-7 text-center text-sm tabular-nums")}>{value}</span>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Agregar"
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
