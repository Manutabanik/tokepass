"use client"

import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatTicketPrice } from "@/lib/format"
import {
  BUNDLE_TYPE_LABELS,
  bundleSavings,
  inferBundleType,
  type BundleType,
} from "@/lib/inventory/flexible-bundles"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { isTicketSoldOut } from "@/lib/checkout/ticket-stock"
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
  const soldOut = isTicketSoldOut(bundle)

  const comboLine = bundle.comboItems?.length
    ? bundle.comboItems
        .map((item) => `${item.quantity}× ${item.name}`)
        .join(" · ")
    : BUNDLE_TYPE_LABELS[type]

  return (
    <article
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-card/60 px-5 py-3.5 transition-all hover:border-white/20",
        selected && "border-emerald-500/40",
        soldOut && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-base font-bold text-foreground">
          {bundle.name}
        </p>
        <div className="flex min-w-0 items-center gap-2 text-sm font-black text-foreground/90">
          <span className="tabular-nums">
            {formatTicketPrice(bundle.price)}
          </span>
          {bundle.listPrice != null && bundle.listPrice > bundle.price ? (
            <span className="text-xs font-medium text-muted-foreground line-through">
              {formatCurrency(bundle.listPrice)}
            </span>
          ) : null}
          {savings.amount > 0 ? (
            <span className="text-xs font-semibold text-emerald-400">
              Ahorrás {formatCurrency(savings.amount)}
            </span>
          ) : null}
          <span className="truncate text-xs font-medium text-muted-foreground">
            {comboLine}
          </span>
        </div>
      </div>
      <Button
        type="button"
        className="h-9 shrink-0 rounded-xl bg-emerald-500 px-3 text-sm font-semibold text-black hover:bg-emerald-400"
        disabled={isPending || soldOut}
        onClick={onBuy}
      >
        {soldOut ? "Agotado" : selected ? "En el carrito" : "Agregar"}
      </Button>
    </article>
  )
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
