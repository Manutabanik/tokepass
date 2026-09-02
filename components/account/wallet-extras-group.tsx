"use client"

import { QrCode } from "lucide-react"
import { useState } from "react"

import type { MyStoreRedemption } from "@/app/actions/addons"
import type { MyTicket } from "@/app/actions/tickets"
import { ExtraConsumableCard } from "@/components/public/living-store-card"
import { QrScanLightbox } from "@/components/public/qr-scan-lightbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatEventDay, formatEventTime } from "@/lib/format"
import {
  EVENT_ITEM_CATEGORY_ICONS,
  EVENT_ITEM_CATEGORY_LABELS,
  type EventItemCategory,
} from "@/lib/store-categories"
import {
  groupWalletExtraUnits,
  inferCheckoutExtraCategory,
  type WalletExtraBundle,
  type WalletExtraGroupable,
} from "@/lib/tickets/wallet-extras"
import { cn } from "@/lib/utils"

export type WalletExtraDisplayUnit = WalletExtraGroupable & {
  category: EventItemCategory
  eventTitle: string
  eventDate: string
  description?: string | null
  imageUrl?: string | null
  price: number
  ready: boolean
  redeemedLabel?: string | null
  qr:
    | { kind: "store"; token: string }
    | { kind: "door"; ticketId: string; totpSecret: string; isStatic: boolean }
}

export function storeRedemptionToExtraUnit(
  redemption: MyStoreRedemption,
): WalletExtraDisplayUnit {
  return {
    id: redemption.id,
    orderId: redemption.orderId,
    productKey: redemption.itemId?.trim()
      ? `item:${redemption.itemId}`
      : `name:${redemption.itemName}`,
    title: redemption.itemName,
    category: redemption.itemCategory,
    eventTitle: redemption.eventTitle,
    eventDate: redemption.eventDate,
    description: redemption.itemDescription,
    imageUrl: redemption.itemImageUrl,
    price: redemption.itemPrice,
    ready: redemption.status === "valid",
    redeemedLabel: redemption.redeemedAt
      ? `Ya fue canjeado · ${new Date(redemption.redeemedAt).toLocaleString("es-AR")}`
      : "Ya fue canjeado",
    qr: { kind: "store", token: redemption.qrCodeToken },
  }
}

export function checkoutTicketToExtraUnit(ticket: MyTicket): WalletExtraDisplayUnit {
  return {
    id: ticket.id,
    orderId: ticket.orderId,
    productKey: `tier:${ticket.tierName}`,
    title: ticket.tierName,
    category: inferCheckoutExtraCategory(ticket.tierName),
    eventTitle: ticket.eventTitle,
    eventDate: ticket.eventDate,
    description: ticket.bonusReward,
    imageUrl: ticket.flyerUrl,
    price: ticket.tierPrice,
    ready: ticket.status === "valid",
    redeemedLabel: "Ya fue canjeado",
    qr: {
      kind: "door",
      ticketId: ticket.id,
      totpSecret: ticket.totpSecret ?? "",
      isStatic: ticket.qrType === "static",
    },
  }
}

export function groupWalletExtraDisplayUnits(
  checkoutExtras: MyTicket[],
  redemptions: MyStoreRedemption[],
): WalletExtraBundle<WalletExtraDisplayUnit>[] {
  return groupWalletExtraUnits([
    ...checkoutExtras.map(checkoutTicketToExtraUnit),
    ...redemptions.map(storeRedemptionToExtraUnit),
  ])
}

function ExtraQrLightbox({
  unit,
  open,
  onOpenChange,
}: {
  unit: WalletExtraDisplayUnit | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!unit) return null
  const qr = unit.qr
  return qr.kind === "store" ? (
    <QrScanLightbox
      open={open}
      onOpenChange={onOpenChange}
      kind="store"
      isStatic={false}
      ticketId={qr.token}
      totpSecret=""
      title={`Canje: ${unit.title}`}
      caption="Acercá este código al escáner de canje"
    />
  ) : (
    <QrScanLightbox
      open={open}
      onOpenChange={onOpenChange}
      kind="door"
      isStatic={qr.isStatic}
      ticketId={qr.ticketId}
      totpSecret={qr.totpSecret}
      title={`Canje: ${unit.title}`}
      caption="Acercá este código al escáner de canje"
    />
  )
}

export function WalletExtrasBundleCard({
  bundle,
}: {
  bundle: WalletExtraBundle<WalletExtraDisplayUnit>
}) {
  const [open, setOpen] = useState(false)
  const [scanUnit, setScanUnit] = useState<WalletExtraDisplayUnit | null>(null)
  const first = bundle.items[0]
  if (!first) return null

  if (bundle.count === 1) {
    return (
      <ExtraConsumableCard
        category={first.category}
        title={first.title}
        eventTitle={first.eventTitle}
        eventDate={first.eventDate}
        description={first.description}
        imageUrl={first.imageUrl}
        price={first.price}
        ready={first.ready}
        redeemedLabel={first.redeemedLabel}
        qr={first.qr}
      />
    )
  }

  const readyCount = bundle.items.filter((item) => item.ready).length
  const CategoryIcon = EVENT_ITEM_CATEGORY_ICONS[first.category]

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-violet-500/35 bg-card text-card-foreground">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="w-full px-4 py-5 text-left sm:px-5"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
              {first.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={first.imageUrl}
                  alt={bundle.title}
                  className="size-full object-cover"
                />
              ) : (
                <span className="grid size-full place-items-center text-violet-700 dark:text-violet-300">
                  <CategoryIcon className="size-5" aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300/90">
                {EVENT_ITEM_CATEGORY_LABELS[first.category]}
              </p>
              <h2 className="mt-1 text-balance text-[clamp(0.9375rem,4vw,1.125rem)] font-bold leading-snug tracking-tight text-foreground">
                {bundle.title}
              </h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {first.eventTitle}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatEventDay(first.eventDate)} · {formatEventTime(first.eventDate)}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              readyCount > 0
                ? "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/35 dark:text-emerald-300"
                : "bg-muted text-muted-foreground ring-1 ring-border",
            )}
          >
            {readyCount > 0 ? `${readyCount} listos` : "Entregados"}
          </Badge>
        </header>
        <p className="mt-4 text-center text-sm font-semibold text-violet-700 dark:text-violet-300">
          {open ? "Ocultar códigos" : `Ver los ${bundle.count} códigos`}
        </p>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto border-t border-border px-4 py-3 [scrollbar-width:thin]">
            {bundle.items.map((unit, index) => (
              <div
                key={unit.id}
                className="w-[min(16.5rem,78vw)] shrink-0 snap-start rounded-2xl border border-border bg-background p-3"
              >
                <p className="text-sm font-bold text-foreground">
                  Canje {index + 1}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {unit.ready ? "Listo para canjear" : unit.redeemedLabel}
                </p>
                {unit.ready ? (
                  <Button
                    type="button"
                    className="mt-3 h-11 w-full justify-center gap-2 rounded-xl bg-violet-500 text-white hover:bg-violet-400"
                    onClick={() => setScanUnit(unit)}
                  >
                    <QrCode className="size-4" aria-hidden="true" />
                    Mostrar QR de canje
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ExtraQrLightbox
        unit={scanUnit}
        open={Boolean(scanUnit)}
        onOpenChange={(next) => {
          if (!next) setScanUnit(null)
        }}
      />
    </article>
  )
}
