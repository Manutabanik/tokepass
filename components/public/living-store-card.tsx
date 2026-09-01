"use client"

import { QrCode } from "lucide-react"
import { useState } from "react"

import type { MyStoreRedemption } from "@/app/actions/addons"
import type { MyTicket } from "@/app/actions/tickets"
import { QrScanLightbox } from "@/components/public/qr-scan-lightbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"
import {
  EVENT_ITEM_CATEGORY_ICONS,
  EVENT_ITEM_CATEGORY_LABELS,
  type EventItemCategory,
} from "@/lib/store-categories"
import { inferCheckoutExtraCategory } from "@/lib/tickets/wallet-extras"
import { cn } from "@/lib/utils"

function ExtraConsumableCard({
  category,
  title,
  eventTitle,
  eventDate,
  description,
  imageUrl,
  price,
  ready,
  redeemedLabel,
  qr,
}: {
  category: EventItemCategory
  title: string
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
}) {
  const [scanOpen, setScanOpen] = useState(false)
  const CategoryIcon = EVENT_ITEM_CATEGORY_ICONS[category]

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[1.75rem] border bg-card text-card-foreground",
        ready ? "border-violet-500/35" : "border-border opacity-80",
      )}
    >
      <div className="space-y-4 px-4 py-5 sm:px-5">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={title}
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
                {EVENT_ITEM_CATEGORY_LABELS[category]}
              </p>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground">
                {title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{eventTitle}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatEventDay(eventDate)} · {formatEventTime(eventDate)}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              ready &&
                "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/35 dark:text-emerald-300",
              !ready && "bg-muted text-muted-foreground ring-1 ring-border",
            )}
          >
            {ready ? "Listo" : "Entregado"}
          </Badge>
        </header>

        {description ? (
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Valor</span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatCurrency(price)}
          </span>
        </div>

        {ready ? (
          <div className="space-y-3">
            <Button
              type="button"
              className="h-11 w-full cursor-pointer rounded-full bg-violet-500 text-white transition-transform hover:scale-105 hover:bg-violet-400"
              onClick={() => setScanOpen(true)}
              title="Tocar para agrandar"
            >
              <QrCode className="size-4" aria-hidden="true" />
              Mostrar QR de canje
            </Button>
            {qr.kind === "store" ? (
              <QrScanLightbox
                open={scanOpen}
                onOpenChange={setScanOpen}
                kind="store"
                isStatic={false}
                ticketId={qr.token}
                totpSecret=""
                caption="Acercá este código al escáner de canje"
              />
            ) : (
              <QrScanLightbox
                open={scanOpen}
                onOpenChange={setScanOpen}
                kind="door"
                isStatic={qr.isStatic}
                ticketId={qr.ticketId}
                totpSecret={qr.totpSecret}
                caption="Acercá este código al escáner de canje"
              />
            )}
          </div>
        ) : (
          <p className="rounded-2xl bg-muted px-3 py-3 text-center text-xs text-muted-foreground">
            {redeemedLabel ?? "Ya fue canjeado"}
          </p>
        )}
      </div>
    </article>
  )
}

export function LivingStoreCard({
  redemption,
}: {
  redemption: MyStoreRedemption
}) {
  const ready = redemption.status === "valid"
  return (
    <ExtraConsumableCard
      category={redemption.itemCategory}
      title={redemption.itemName}
      eventTitle={redemption.eventTitle}
      eventDate={redemption.eventDate}
      description={redemption.itemDescription}
      imageUrl={redemption.itemImageUrl}
      price={redemption.itemPrice}
      ready={ready}
      redeemedLabel={
        redemption.redeemedAt
          ? `Ya fue canjeado · ${new Date(redemption.redeemedAt).toLocaleString("es-AR")}`
          : "Ya fue canjeado"
      }
      qr={{ kind: "store", token: redemption.qrCodeToken }}
    />
  )
}

export function LivingCheckoutExtraCard({ ticket }: { ticket: MyTicket }) {
  const ready = ticket.status === "valid"
  return (
    <ExtraConsumableCard
      category={inferCheckoutExtraCategory(ticket.tierName)}
      title={ticket.tierName}
      eventTitle={ticket.eventTitle}
      eventDate={ticket.eventDate}
      description={ticket.bonusReward}
      imageUrl={ticket.flyerUrl}
      price={ticket.tierPrice}
      ready={ready}
      redeemedLabel="Ya fue canjeado"
      qr={{
        kind: "door",
        ticketId: ticket.id,
        totpSecret: ticket.totpSecret ?? "",
        isStatic: ticket.qrType === "static",
      }}
    />
  )
}

/** @deprecated Prefer LivingStoreCard */
export const LivingBarCard = LivingStoreCard
