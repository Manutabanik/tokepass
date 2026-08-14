"use client"

import {
  Armchair,
  Car,
  Gift,
  Minus,
  Plus,
  Sparkles,
  Ticket,
} from "lucide-react"

import { BundleCardSelector } from "@/components/public/bundle-card-selector"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency } from "@/lib/format"
import {
  inferInventoryTierType,
  isQuantityInventoryType,
  type InventoryTierType,
} from "@/lib/inventory/unified-inventory"
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
  selectedSeat: SelectedNumberedSeat | null
  showUpsell: boolean
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatFlow: () => void
  onClearSeat: () => void
  onAddUpsell: (tierId: string) => void
  onSkipUpsell: () => void
}

export function EventCheckoutSelector({
  tiers,
  quantities,
  isPending,
  hasSeatingFlow,
  selectedSeat,
  showUpsell,
  onQuantityChange,
  onOpenSeatFlow,
  onClearSeat,
  onAddUpsell,
  onSkipUpsell,
}: Props) {
  const grouped = groupTiers(tiers)
  const tabs = (
    [
      hasSeatingFlow || grouped.seated.length > 0 ? "seated" : null,
      grouped.general.length > 0 ? "general" : null,
      grouped.bundle.length > 0 ? "bundle" : null,
      grouped.addon.length > 0 ? "addon" : null,
    ] as Array<InventoryTierType | null>
  ).filter((tab): tab is InventoryTierType => Boolean(tab))

  const defaultTab = tabs[0] ?? "general"
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
      <Tabs defaultValue={defaultTab} className="gap-3">
        <TabsList className="flex h-auto w-full flex-wrap rounded-lg bg-muted p-1">
          {tabs.includes("seated") ? (
            <TabsTrigger value="seated" className="min-h-10 flex-1 gap-1.5">
              <Armchair className="size-3.5" />
              Numeradas
            </TabsTrigger>
          ) : null}
          {tabs.includes("general") ? (
            <TabsTrigger value="general" className="min-h-10 flex-1 gap-1.5">
              <Ticket className="size-3.5" />
              Generales
            </TabsTrigger>
          ) : null}
          {tabs.includes("bundle") ? (
            <TabsTrigger value="bundle" className="min-h-10 flex-1 gap-1.5">
              <Gift className="size-3.5" />
              Combos
            </TabsTrigger>
          ) : null}
          {tabs.includes("addon") ? (
            <TabsTrigger value="addon" className="min-h-10 flex-1 gap-1.5">
              <Car className="size-3.5" />
              Extras
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
                    {formatCurrency(selectedSeat.price)} · 8 min de reserva al
                    pagar
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
                <p className="text-sm text-foreground">
                  Elegí mesa, tablón o butaca en el mapa.
                </p>
                <Button
                  type="button"
                  className="mt-3"
                  disabled={isPending || !hasSeatingFlow}
                  onClick={onOpenSeatFlow}
                >
                  <Armchair className="size-4" />
                  Abrir mapa de ubicaciones
                </Button>
              </div>
            )}
          </TabsContent>
        ) : null}

        {tabs.includes("general") ? (
          <TabsContent value="general">
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
        const max = Math.max(0, tier.available)
        const quantity = quantities[tier.id] ?? 0
        return (
          <li
            key={tier.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 px-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {tier.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(tier.price)}
                {max === 0 ? " · agotado" : ` · ${max} disponibles`}
              </p>
            </div>
            <Stepper
              value={quantity}
              max={max}
              disabled={isPending || max === 0}
              onChange={(next) => onQuantityChange(tier.id, next, max)}
            />
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
