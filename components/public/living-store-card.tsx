"use client"

import { QrCode } from "lucide-react"
import { useState } from "react"

import type { MyStoreRedemption } from "@/app/actions/addons"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"
import {
  EVENT_ITEM_CATEGORY_ICONS,
  EVENT_ITEM_CATEGORY_LABELS,
} from "@/lib/store-categories"
import { cn } from "@/lib/utils"

export function LivingStoreCard({
  redemption,
}: {
  redemption: MyStoreRedemption
}) {
  const [showQr, setShowQr] = useState(false)
  const isValid = redemption.status === "valid"
  const isRedeemed = redemption.status === "redeemed"
  const CategoryIcon = EVENT_ITEM_CATEGORY_ICONS[redemption.itemCategory]

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[1.75rem] border bg-zinc-950 text-zinc-100",
        isRedeemed ? "border-zinc-800 opacity-80" : "border-violet-500/35",
      )}
    >
      <div className="space-y-4 px-4 py-5 sm:px-5">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-zinc-900">
              {redemption.itemImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={redemption.itemImageUrl}
                  alt={redemption.itemName}
                  className="size-full object-cover"
                />
              ) : (
                <span className="grid size-full place-items-center text-violet-300">
                  <CategoryIcon className="size-5" aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-300/90">
                {EVENT_ITEM_CATEGORY_LABELS[redemption.itemCategory]}
              </p>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-white">
                {redemption.itemName}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">{redemption.eventTitle}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {formatEventDay(redemption.eventDate)} ·{" "}
                {formatEventTime(redemption.eventDate)}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              isValid &&
                "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/35",
              isRedeemed && "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700",
            )}
          >
            {isValid ? "Listo" : "Entregado"}
          </Badge>
        </header>

        {redemption.itemDescription ? (
          <p className="text-sm leading-6 text-zinc-500">
            {redemption.itemDescription}
          </p>
        ) : null}

        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Valor</span>
          <span className="font-semibold tabular-nums text-white">
            {formatCurrency(redemption.itemPrice)}
          </span>
        </div>

        {isValid ? (
          <div className="space-y-3">
            <Button
              type="button"
              className="h-11 w-full rounded-full bg-violet-500 text-white hover:bg-violet-400"
              onClick={() => setShowQr((current) => !current)}
            >
              <QrCode className="size-4" aria-hidden="true" />
              {showQr ? "Ocultar QR de canje" : "Mostrar QR de canje"}
            </Button>

            {showQr ? (
              <div className="rounded-2xl border border-violet-500/20 bg-zinc-900/80 px-3 py-4">
                <LivingTicketQR ticketId={redemption.qrCodeToken} />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl bg-zinc-900 px-3 py-3 text-center text-xs text-zinc-500">
            Ya fue canjeado
            {redemption.redeemedAt
              ? ` · ${new Date(redemption.redeemedAt).toLocaleString("es-AR")}`
              : null}
          </p>
        )}
      </div>
    </article>
  )
}

/** @deprecated Prefer LivingStoreCard */
export const LivingBarCard = LivingStoreCard
