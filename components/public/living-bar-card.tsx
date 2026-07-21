"use client"

import { GlassWater, QrCode } from "lucide-react"
import { useState } from "react"

import type { MyBarRedemption } from "@/app/actions/addons"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export function LivingBarCard({ redemption }: { redemption: MyBarRedemption }) {
  const [showQr, setShowQr] = useState(false)
  const isValid = redemption.status === "valid"
  const isRedeemed = redemption.status === "redeemed"

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[1.75rem] border bg-zinc-950 text-zinc-100",
        isRedeemed ? "border-zinc-800 opacity-80" : "border-amber-500/35",
      )}
    >
      <div className="space-y-4 px-4 py-5 sm:px-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400/90">
              Consumición
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
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              isValid && "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/35",
              isRedeemed && "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700",
            )}
          >
            {isValid ? "Lista" : "Entregada"}
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
              className="h-11 w-full rounded-full bg-amber-400 text-zinc-950 hover:bg-amber-300"
              onClick={() => setShowQr((current) => !current)}
            >
              <QrCode className="size-4" aria-hidden="true" />
              {showQr ? "Ocultar QR de Barra" : "Mostrar QR de Barra"}
            </Button>

            {showQr ? (
              <div className="rounded-2xl border border-amber-500/20 bg-zinc-900/80 px-3 py-4">
                <LivingTicketQR ticketId={redemption.qrCodeToken} />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl bg-zinc-900 px-3 py-3 text-center text-xs text-zinc-500">
            Ya fue canjeada en barra
            {redemption.redeemedAt
              ? ` · ${new Date(redemption.redeemedAt).toLocaleString("es-AR")}`
              : null}
          </p>
        )}
      </div>
    </article>
  )
}

export function BarWalletEmpty() {
  return (
    <div className="grid min-h-64 place-items-center rounded-[1.75rem] border border-dashed border-zinc-800 bg-zinc-950/60 px-5 py-12 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-zinc-900 text-amber-300/80 ring-1 ring-inset ring-zinc-800">
          <GlassWater className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-bold text-white">Sin consumiciones</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-zinc-500">
          Cuando compres tragos o combos con tu entrada, aparecerán acá con su
          QR de barra.
        </p>
      </div>
    </div>
  )
}
