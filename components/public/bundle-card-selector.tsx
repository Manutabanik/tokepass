"use client"

import {
  CalendarDays,
  Car,
  Check,
  Gift,
  Sparkles,
  Ticket,
} from "lucide-react"

import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatTicketPrice } from "@/lib/format"
import {
  BUNDLE_TYPE_LABELS,
  bundleSavings,
  inferBundleType,
  type BundleType,
} from "@/lib/inventory/flexible-bundles"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { cn } from "@/lib/utils"

export type PublicBundleCard = TicketSelectorTier & {
  bundleType?: BundleType | string | null
}

type Props = {
  bundles: PublicBundleCard[]
  quantities: Record<string, number>
  isPending: boolean
  onBuy: (tierId: string) => void
}

export function BundleCardSelector({
  bundles,
  quantities,
  isPending,
  onBuy,
}: Props) {
  if (bundles.length === 0) return null

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-300">
          Combos y Promos
        </p>
        <h3 className="mt-1 text-base font-semibold text-foreground">
          Promociones destacadas
        </h3>
      </div>
      <ul className="space-y-3">
        {bundles.map((bundle) => (
          <li key={bundle.id}>
            <BundlePromoCard
              bundle={bundle}
              selected={ (quantities[bundle.id] ?? 0) > 0 }
              isPending={isPending}
              onBuy={() => onBuy(bundle.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function BundlePromoCard({
  bundle,
  selected,
  isPending,
  onBuy,
}: {
  bundle: PublicBundleCard
  selected: boolean
  isPending: boolean
  onBuy: () => void
}) {
  const type = inferBundleType({
    bundleType: bundle.bundleType,
    dayId: bundle.dayId,
    items: (bundle.comboItems ?? []).map((item, index) => ({
      tierId: `${bundle.id}-${index}`,
      quantity: item.quantity,
    })),
  })
  const savings = bundleSavings(bundle.listPrice ?? 0, bundle.price)
  const soldOut = bundle.available <= 0

  return (
    <article
      className={cn(
        "rounded-2xl border p-4 shadow-[0_0_24px_-12px_rgba(16,185,129,0.55)]",
        "border-emerald-400/35 bg-emerald-500/5 backdrop-blur-md",
        selected && "ring-1 ring-emerald-400/50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Gift className="size-4 text-emerald-400" />
            {bundle.name}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            {BUNDLE_TYPE_LABELS[type]}
          </p>
        </div>
        {savings.amount > 0 ? (
          <Badge className="h-auto bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100">
            Ahorrás {formatCurrency(savings.amount)}
          </Badge>
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-xl font-black tabular-nums text-foreground">
          {formatTicketPrice(bundle.price)}
        </span>
        {bundle.listPrice != null && bundle.listPrice > bundle.price ? (
          <span className="text-xs text-muted-foreground line-through">
            {formatCurrency(bundle.listPrice)}
          </span>
        ) : null}
      </div>

      {bundle.comboItems && bundle.comboItems.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {bundle.comboItems.map((item) => (
            <li
              key={`${item.name}-${item.quantity}`}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Check className="size-3.5 text-emerald-400" />
              <ComponentIcon name={item.name} />
              <span>
                {item.quantity} × {item.name}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Pack promocional con precio unificado.
        </p>
      )}

      <Button
        type="button"
        className="mt-4 w-full min-h-11 rounded-full bg-emerald-500 font-semibold text-black hover:bg-emerald-400"
        disabled={isPending || soldOut}
        onClick={onBuy}
      >
        <Sparkles className="size-4" />
        {soldOut
          ? "Agotado"
          : selected
            ? "Combo en el carrito"
            : "Comprar combo promocional"}
      </Button>
    </article>
  )
}

function ComponentIcon({ name }: { name: string }) {
  const normalized = name.toLocaleLowerCase("es")
  if (/(estacion|parking|auto|cochera)/.test(normalized)) {
    return <Car className="size-3.5" />
  }
  if (/(día|dia|jornada|abono|pase)/.test(normalized)) {
    return <CalendarDays className="size-3.5" />
  }
  return <Ticket className="size-3.5" />
}

export function publicBundlesFromTiers(
  tiers: TicketSelectorTier[],
): PublicBundleCard[] {
  return tiers.filter(
    (tier) =>
      inferInventoryTierType({
        tierType: tier.tierType,
        layoutType: tier.layoutType,
        category: tier.category,
      }) === "bundle",
  )
}
