"use client"

import {
  CalendarDays,
  Clock3,
  Gift,
  IdCard,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react"
import Image from "next/image"
import { QRCodeSVG } from "qrcode.react"

import type { MyTicket } from "@/app/actions/tickets"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { SaveTicketButton } from "@/components/public/save-ticket-button"
import { TransferTicketDialog } from "@/components/public/transfer-ticket-dialog"
import { Badge } from "@/components/ui/badge"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { cn } from "@/lib/utils"

function isVipTier(tierName: string): boolean {
  return /\bvip\b/i.test(tierName)
}

function isUsedStatus(status: MyTicket["status"]): boolean {
  return status === "used" || status === "scanned"
}

export function LivingTicketCard({
  ticket,
  userId,
  showQr = true,
  offline = false,
}: {
  ticket: MyTicket
  userId: string
  showQr?: boolean
  offline?: boolean
}) {
  const vip = isVipTier(ticket.tierName)
  const canShowLiveQr = showQr && ticket.status === "valid"
  const isStatic = ticket.qrType === "static"
  const canTransfer =
    ticket.status === "valid" &&
    ticket.transferCount < ticket.maxTransfersAllowed &&
    !offline

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] bg-zinc-950 text-zinc-100",
        vip
          ? "border border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
          : "border border-zinc-800",
      )}
    >
      {vip && (
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_42%)]"
          aria-hidden="true"
        />
      )}

      <div className="relative aspect-[16/9] overflow-hidden bg-zinc-900">
        {ticket.flyerUrl ? (
          <Image
            src={ticket.flyerUrl}
            alt={ticket.eventTitle}
            fill
            sizes="(max-width: 640px) 100vw, 420px"
            className="object-cover"
            priority={canShowLiveQr}
          />
        ) : (
          <div className="flex h-full w-full items-end bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 p-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">
                Tokepass
              </p>
              <p className="mt-1 line-clamp-2 text-base font-bold leading-snug">
                {ticket.eventTitle}
              </p>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
      </div>

      <div className="relative space-y-4 px-4 pb-5 pt-4 sm:px-5">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                vip
                  ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40"
                  : "bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700",
              )}
            >
              {ticket.tierName}
            </Badge>
            {isStatic ? (
              <Badge
                variant="outline"
                className="rounded-full border-sky-500/30 bg-sky-500/10 text-sky-300"
              >
                QR estático
              </Badge>
            ) : null}
            {vip && (
              <Badge className="rounded-full border-0 bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-950 hover:bg-amber-500">
                VIP
              </Badge>
            )}
            {isUsedStatus(ticket.status) && (
              <Badge
                variant="outline"
                className="rounded-full border-sky-500/30 bg-sky-500/10 text-sky-300"
              >
                Usada
              </Badge>
            )}
            {ticket.status === "transferred" && (
              <Badge
                variant="outline"
                className="rounded-full border-red-500/30 bg-red-500/10 text-red-300"
              >
                Transferida
              </Badge>
            )}
            {offline && canShowLiveQr ? (
              <Badge
                variant="outline"
                className="rounded-full border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
              >
                Lista offline
              </Badge>
            ) : null}
          </div>

          <h2 className="text-xl font-black leading-tight tracking-[-0.03em] text-white sm:text-2xl">
            {ticket.eventTitle}
          </h2>

          <div className="space-y-1.5 text-sm text-zinc-400">
            <p className="flex items-center gap-2 capitalize">
              <CalendarDays className="size-4 shrink-0 text-zinc-500" />
              {formatEventDay(ticket.eventDate)}
            </p>
            <p className="flex items-center gap-2">
              <Clock3 className="size-4 shrink-0 text-zinc-500" />
              {formatEventTime(ticket.eventDate)}
            </p>
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-zinc-500" />
              <span className="line-clamp-2">
                {ticket.venueName ?? ticket.eventLocation}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <UserRound className="size-4 shrink-0 text-zinc-500" />
              <span className="truncate">{ticket.holderName}</span>
            </p>
            {ticket.holderDni ? (
              <p className="flex items-center gap-2">
                <IdCard className="size-4 shrink-0 text-zinc-500" />
                DNI {ticket.holderDni}
              </p>
            ) : null}
          </div>
        </header>

        {ticket.bonusReward && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/15 to-cyan-500/10 px-3.5 py-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30">
              <Gift className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/90">
                <Sparkles className="size-3" aria-hidden="true" />
                Smart Yield
              </p>
              <p className="mt-0.5 text-sm font-semibold text-emerald-50">
                {ticket.bonusReward}
              </p>
            </div>
          </div>
        )}

        {canShowLiveQr ? (
          <div className="rounded-[1.5rem] border border-zinc-800/80 bg-black/40 px-3 py-5 sm:px-4">
            <p className="mb-4 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              {isStatic ? "QR fijo · imprimible" : "Living QR · puerta"}
            </p>
            {isStatic ? (
              <div className="mx-auto w-fit rounded-[1.35rem] bg-white p-3.5">
                <QRCodeSVG
                  value={ticket.totpSecret}
                  size={208}
                  level="H"
                  bgColor="#ffffff"
                  fgColor="#09090b"
                />
              </div>
            ) : (
              <LivingTicketQR
                ticketId={ticket.id}
                totpSecret={ticket.totpSecret}
              />
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-sm text-zinc-500">
            {ticket.status === "transferred"
              ? "Esta entrada fue transferida. El QR quedó anulado."
              : "Esta entrada ya no muestra QR vivo en puerta."}
          </div>
        )}

        {canShowLiveQr ? (
          <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 px-3.5 py-3">
            <p className="flex items-start gap-2 text-[12px] leading-5 text-sky-100/95">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-sky-300"
                aria-hidden="true"
              />
              <span>
                <span className="font-bold uppercase tracking-wide text-sky-200">
                  Consejo:{" "}
                </span>
                Podés presentar este QR directamente desde la app, desde tu
                Apple/Google Wallet o como captura/PDF. El primer escaneo en
                puerta validará tu acceso.
              </span>
            </p>
          </div>
        ) : null}

        {ticket.status === "valid" ? (
          <SaveTicketButton
            ticket={ticket}
            userId={userId}
            disabled={offline}
          />
        ) : null}

        {canTransfer ? (
          <TransferTicketDialog
            ticketId={ticket.id}
            eventTitle={ticket.eventTitle}
          />
        ) : null}

        {ticket.status === "valid" && offline ? (
          <p className="text-center text-[11px] text-zinc-600">
            Transferencias disponibles cuando vuelvas a tener conexión.
          </p>
        ) : null}

        <p className="text-center font-mono text-[10px] tracking-wider text-zinc-600">
          #{ticket.id.slice(0, 8).toUpperCase()}
        </p>
      </div>
    </article>
  )
}
