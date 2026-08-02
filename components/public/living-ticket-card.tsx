"use client"

import {
  Armchair,
  CalendarDays,
  Clock3,
  Gift,
  IdCard,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Wifi,
  WifiOff,
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

function normalizeLocationLabel(label: string): string {
  return label
    .replace(/\bmesa\s*#?\s*(\d+)\b/i, "MESA #$1")
    .replace(/\bfila\s*#?\s*(\d+)\b/i, "FILA $1")
    .toUpperCase()
}

function formatPrimaryLocation(ticket: MyTicket): string {
  const label = normalizeLocationLabel(ticket.seatingLabel ?? "")
  if (
    ticket.seatingLayoutType === "table_combo" &&
    !label.startsWith("MESA")
  ) {
    return `MESA #${label.replace(/^#/, "")}`
  }
  return label
}

export function LivingTicketCard({
  ticket,
  userId,
  showQr = true,
  offline = false,
  appleWalletEnabled = false,
  googleWalletEnabled = false,
}: {
  ticket: MyTicket
  userId: string
  showQr?: boolean
  offline?: boolean
  appleWalletEnabled?: boolean
  googleWalletEnabled?: boolean
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
          <div className="relative flex h-full w-full items-end bg-gradient-to-br from-zinc-950 via-zinc-900 to-violet-950 p-4">
            <span className="absolute left-4 top-4 size-9 overflow-hidden rounded-xl bg-black ring-1 ring-white/20">
              <Image
                src="/brand/tokepass-mark.png"
                alt=""
                width={36}
                height={36}
                className="size-full object-cover"
              />
            </span>
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
                "rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em]",
                offline
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                  : "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
              )}
            >
              {offline ? (
                <WifiOff className="size-3" aria-hidden="true" />
              ) : (
                <Wifi className="size-3" aria-hidden="true" />
              )}
              {offline
                ? "Modo offline · acceso válido para ingreso"
                : "Conectado · entrada verificada"}
            </Badge>
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
          </div>

          <h2 className="text-xl font-black leading-tight tracking-[-0.03em] text-white sm:text-2xl">
            {ticket.eventTitle}
          </h2>

          {ticket.dayValidityLabel ? (
            <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400">
              {ticket.dayValidityLabel}
            </p>
          ) : null}

          {ticket.seatingLabel ? (
            <div className="mt-3 rounded-xl border border-emerald-400/45 bg-emerald-400/10 px-3 py-3 shadow-[inset_0_0_18px_rgba(52,211,153,0.05)]">
              <p className="flex items-center gap-2 font-mono text-sm font-black tracking-[0.08em] text-emerald-100">
                <Armchair className="size-4" aria-hidden="true" />
                {formatPrimaryLocation(ticket)}
                {ticket.seatingSectorName
                  ? ` · ${normalizeLocationLabel(ticket.seatingSectorName)}`
                  : null}
                {ticket.seatingRowLabel
                  ? ` · ${normalizeLocationLabel(ticket.seatingRowLabel)}`
                  : null}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                <Users className="size-3.5" aria-hidden="true" />
                QR maestro para {ticket.maxAdmissions}{" "}
                {ticket.maxAdmissions === 1 ? "persona" : "personas"} · (
                {ticket.admissionsUsed}/{ticket.maxAdmissions} ingresados)
              </p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 py-2.5">
              <p className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-zinc-200">
                <Users className="size-4 text-emerald-300" aria-hidden="true" />
                Entrada General / Pista
              </p>
            </div>
          )}

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
                Beneficio incluido
              </p>
              <p className="mt-0.5 text-sm font-semibold text-emerald-50">
                {ticket.bonusReward}
              </p>
            </div>
          </div>
        )}

        {canShowLiveQr ? (
          <div
            className="rounded-[1.5rem] border border-zinc-800/80 bg-black/40 px-3 py-5 sm:px-4"
            onContextMenu={(event) => event.preventDefault()}
          >
            <p className="mb-4 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              {isStatic ? "QR fijo · imprimible" : "QR dinámico · ingreso"}
            </p>
            {isStatic ? (
              <div className="pointer-events-none mx-auto w-fit select-none rounded-[1.35rem] bg-white p-3.5">
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
                {isStatic ? (
                  <>
                    <span className="font-bold uppercase tracking-wide text-sky-200">
                      Ingreso:{" "}
                    </span>
                    Podés presentar este código desde la aplicación, la billetera
                    del teléfono o el PDF emitido.
                  </>
                ) : (
                  <>
                    <span className="font-bold uppercase tracking-wide text-sky-200">
                      Seguridad:{" "}
                    </span>
                    Abrí esta entrada al llegar. El código cambia cada 15
                    segundos y las capturas vencen automáticamente.
                  </>
                )}
              </span>
            </p>
          </div>
        ) : null}

        {ticket.status === "valid" ? (
          <SaveTicketButton
            ticket={ticket}
            userId={userId}
            disabled={offline}
            appleWalletEnabled={appleWalletEnabled}
            googleWalletEnabled={googleWalletEnabled}
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
        <p className="border-t border-zinc-800/80 pt-3 text-center text-[10px] leading-4 text-zinc-500">
          Entrada emitida bajo responsabilidad exclusiva del Organizador.
          Prohibida su reventa.
        </p>
      </div>
    </article>
  )
}
