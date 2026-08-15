"use client"

import {
  Armchair,
  Ban,
  Camera,
  FlaskConical,
  Gift,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"

import type { MyTicket } from "@/app/actions/tickets"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { QrEnlargeTrigger, QrScanLightbox } from "@/components/public/qr-scan-lightbox"
import { ResaleTicketDialog } from "@/components/public/resale-ticket-dialog"
import { StoryFlyerTrigger } from "@/components/public/story-flyer-modal"
import { TransferTicketDialog } from "@/components/public/transfer-ticket-dialog"
import { WalletPassButtons } from "@/components/account/wallet-pass-buttons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { storyCategoryLabel } from "@/lib/story-canvas"

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

function TicketManageSheet({
  ticket,
  offline,
  appleWalletEnabled,
  googleWalletEnabled,
  canTransfer,
  canResale,
  open,
  onOpenChange,
}: {
  ticket: MyTicket
  offline: boolean
  appleWalletEnabled: boolean
  googleWalletEnabled: boolean
  canTransfer: boolean
  canResale: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isStatic = ticket.qrType === "static"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] gap-0 overflow-y-auto rounded-t-3xl border border-border bg-background p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:inset-x-auto md:left-1/2 md:max-w-md md:-translate-x-1/2 md:rounded-3xl"
      >
        <SheetHeader className="border-0 p-0 pb-4">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/25 md:hidden" />
          <SheetTitle>Gestionar entrada</SheetTitle>
          <SheetDescription>
            {ticket.tierName}
            {ticket.holderName ? ` · ${ticket.holderName}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col">
          {ticket.status === "valid" ? (
            <div className="space-y-3">
              <StoryFlyerTrigger
                data={{
                  eventTitle: ticket.eventTitle,
                  eventDate: ticket.eventDate,
                  eventLocation: ticket.venueName ?? ticket.eventLocation,
                  imageUrl: ticket.flyerUrl,
                  customStoryUrl: ticket.socialShareImageUrl,
                  mode: "buyer",
                  organizerName: ticket.organizerName,
                  organizerAvatarUrl: ticket.organizerAvatarUrl,
                  eventId: ticket.eventId,
                  categoryLabel: storyCategoryLabel({
                    tierName: ticket.tierName,
                    seatingLabel: ticket.seatingLabel,
                    seatingSectorName: ticket.seatingSectorName,
                  }),
                }}
                label="Compartir en Historias"
                icon={<Camera className="size-5 shrink-0" aria-hidden />}
                variant="hero"
              />

              <WalletPassButtons
                ticketId={ticket.id}
                flyerUrl={ticket.flyerUrl}
                disabled={offline}
                appleWalletEnabled={appleWalletEnabled}
                googleWalletEnabled={googleWalletEnabled}
              />
            </div>
          ) : null}

          {canTransfer || (canResale && !ticket.activeResaleListingId) ? (
            <div
              className={cn(
                "mt-4 grid gap-3",
                canTransfer && canResale && !ticket.activeResaleListingId
                  ? "grid-cols-2"
                  : "grid-cols-1",
              )}
            >
              {canTransfer ? (
                <TransferTicketDialog
                  ticketId={ticket.id}
                  eventTitle={ticket.eventTitle}
                  triggerLabel="Enviar / Regalar"
                  triggerClassName="h-auto min-h-[5.75rem] w-full flex-col gap-2 whitespace-normal rounded-2xl border border-border bg-muted/30 px-3 py-4 text-center text-sm font-semibold leading-5 text-foreground hover:bg-muted/55"
                />
              ) : null}
              {canResale && !ticket.activeResaleListingId ? (
                <ResaleTicketDialog
                  ticketId={ticket.id}
                  eventTitle={ticket.eventTitle}
                  tierPrice={ticket.tierPrice}
                  activeListingId={ticket.activeResaleListingId}
                  disabled={offline}
                  triggerLabel="Vender Entrada"
                  triggerClassName="h-auto min-h-[5.75rem] w-full flex-col gap-2 whitespace-normal rounded-2xl border border-border bg-muted/30 px-3 py-4 text-center text-sm font-semibold leading-5 text-foreground hover:bg-muted/55"
                />
              ) : null}
            </div>
          ) : null}

          {ticket.activeResaleListingId ? (
            <div className="mt-4">
              <ResaleTicketDialog
                ticketId={ticket.id}
                eventTitle={ticket.eventTitle}
                tierPrice={ticket.tierPrice}
                activeListingId={ticket.activeResaleListingId}
                disabled={offline}
              />
            </div>
          ) : null}

          <Link
            href={`/cuenta/entradas/${ticket.id}`}
            className="mt-4 inline-flex min-h-10 items-center justify-center text-sm font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
          >
            Ver detalle de la entrada
          </Link>

          {ticket.status === "valid" && offline ? (
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Transferencias y reventa disponibles cuando vuelvas a tener
              conexión.
            </p>
          ) : null}

          {ticket.bonusReward ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-3.5 py-3">
              <Gift
                className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-300/90">
                  Beneficio incluido
                </p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {ticket.bonusReward}
                </p>
              </div>
            </div>
          ) : null}

          {ticket.status === "valid" ? (
            <p className="mt-4 flex items-start gap-2 text-[12px] leading-5 text-muted-foreground">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span>
                {isStatic
                  ? "Podés presentar este código desde la app, la billetera del teléfono o el PDF emitido."
                  : "Abrí esta entrada al llegar. El código cambia cada 15 segundos y las capturas vencen automáticamente."}
              </span>
            </p>
          ) : null}

          {ticket.isSponsoredByTokepass ? (
            <p className="mt-3 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800 dark:text-amber-200">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Comisión Tokepass bonificada
            </p>
          ) : null}

          <p className="mt-4 text-center font-mono text-[10px] tracking-wider text-muted-foreground">
            #{ticket.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="mt-3 border-t border-border pt-3 text-center text-[10px] leading-4 text-muted-foreground">
            Entrada emitida bajo responsabilidad exclusiva del Organizador. La
            reventa solo es válida a través del marketplace oficial de Tokepass.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
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
  const [manageOpen, setManageOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const vip = isVipTier(ticket.tierName)
  const isFree = Number(ticket.tierPrice) === 0
  const canShowLiveQr = showQr && ticket.status === "valid"
  const isStatic = ticket.qrType === "static"
  const canTransfer =
    ticket.status === "valid" &&
    ticket.transferCount < ticket.maxTransfersAllowed &&
    !offline &&
    !ticket.activeResaleListingId

  const canResale =
    ticket.status === "valid" &&
    ticket.tierPrice > 0 &&
    !ticket.isTest &&
    ticket.admissionsUsed === 0 &&
    ticket.transferCount < ticket.maxTransfersAllowed &&
    !offline

  const seatingLine = ticket.seatingLabel
    ? [
        formatPrimaryLocation(ticket),
        ticket.seatingSectorName
          ? normalizeLocationLabel(ticket.seatingSectorName)
          : null,
        ticket.seatingRowLabel
          ? normalizeLocationLabel(ticket.seatingRowLabel)
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null

  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-[1.65rem] border bg-card px-5 pb-4 pt-5 text-card-foreground shadow-sm",
        vip
          ? "border-amber-400/50 shadow-[0_0_18px_rgba(245,158,11,0.18)]"
          : "border-border/80",
        ticket.isTest && "border-amber-400/60",
        isFree && !ticket.isTest && "border-rose-500/40",
      )}
    >
      {ticket.isTest ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="-rotate-12 rounded-xl border-2 border-amber-300/80 bg-amber-500/25 px-4 py-2 text-center text-[11px] font-black uppercase tracking-[0.16em] text-amber-950 shadow-[0_0_24px_rgba(245,158,11,0.35)] backdrop-blur-[2px] dark:text-amber-100">
              Test / Borrador
              <span className="mt-0.5 block text-[10px] font-bold tracking-[0.12em] text-amber-900/90 dark:text-amber-50/90">
                No válido en puerta
              </span>
            </span>
          </div>
          <Badge className="absolute left-3 top-3 z-30 rounded-full border-0 bg-amber-500 text-[10px] font-bold uppercase tracking-wide text-black">
            <FlaskConical className="size-3" aria-hidden="true" />
            Sandbox
          </Badge>
        </>
      ) : null}

      {isFree && !ticket.isTest ? (
        <Badge className="absolute right-3 top-3 z-30 rounded-full border-0 bg-rose-500 text-[10px] font-bold uppercase tracking-wide text-white">
          <Ban className="size-3" aria-hidden="true" />
          $0
        </Badge>
      ) : null}

      <header className="space-y-1.5 text-center">
        <p
          className={cn(
            "text-[11px] font-bold uppercase tracking-[0.18em]",
            vip
              ? "text-amber-700 dark:text-amber-300"
              : "text-muted-foreground",
          )}
        >
          {ticket.tierName}
          {vip ? " · VIP" : null}
        </p>
        {ticket.dayValidityLabel ? (
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
            {ticket.dayValidityLabel}
          </p>
        ) : null}
        {seatingLine ? (
          <p className="flex items-center justify-center gap-1.5 font-mono text-[11px] font-semibold tracking-wide text-foreground">
            <Armchair className="size-3.5 shrink-0 text-muted-foreground" />
            {seatingLine}
          </p>
        ) : null}
        <p className="pt-1 text-sm font-semibold leading-snug text-foreground">
          {ticket.holderName}
        </p>
        {ticket.holderDni ? (
          <p className="text-xs tabular-nums text-muted-foreground">
            DNI {ticket.holderDni}
          </p>
        ) : null}
        {isUsedStatus(ticket.status) || ticket.status === "transferred" ? (
          <Badge
            variant="outline"
            className="mx-auto mt-1 rounded-full text-[10px] font-semibold uppercase tracking-wide"
          >
            {ticket.status === "transferred" ? "Transferida" : "Usada"}
          </Badge>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col items-center justify-center py-4">
        {canShowLiveQr ? (
          <div
            className="w-full"
            onContextMenu={(event) => event.preventDefault()}
          >
            <QrEnlargeTrigger onOpen={() => setScanOpen(true)} className="mx-auto w-fit">
              {isStatic ? (
                <div className="pointer-events-none mx-auto w-fit select-none rounded-[1.35rem] bg-white p-3.5 shadow-sm">
                  <QRCodeSVG
                    value={ticket.totpSecret}
                    size={220}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#09090b"
                  />
                </div>
              ) : (
                <LivingTicketQR
                  ticketId={ticket.id}
                  totpSecret={ticket.totpSecret}
                  size={220}
                />
              )}
            </QrEnlargeTrigger>
            <div className="mt-3 flex justify-center">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  offline
                    ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                    : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
                )}
              >
                {offline ? (
                  <WifiOff className="size-3" aria-hidden="true" />
                ) : (
                  <Wifi className="size-3" aria-hidden="true" />
                )}
                {offline
                  ? "Modo sin conexión - QR disponible para lectura"
                  : isStatic
                    ? "QR fijo"
                    : "Living QR"}
              </span>
            </div>
            <QrScanLightbox
              open={scanOpen}
              onOpenChange={setScanOpen}
              isStatic={isStatic}
              ticketId={ticket.id}
              totpSecret={ticket.totpSecret}
            />
          </div>
        ) : (
          <p className="px-2 text-center text-sm text-muted-foreground">
            {ticket.status === "transferred"
              ? "Esta entrada fue transferida. El QR quedó anulado."
              : "Esta entrada ya no muestra QR vivo en puerta."}
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        className="h-10 w-full rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground"
        onClick={() => setManageOpen(true)}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
        Gestionar entrada
      </Button>

      <TicketManageSheet
        ticket={ticket}
        offline={offline}
        appleWalletEnabled={appleWalletEnabled}
        googleWalletEnabled={googleWalletEnabled}
        canTransfer={canTransfer}
        canResale={canResale}
        open={manageOpen}
        onOpenChange={setManageOpen}
      />
    </article>
  )
}
