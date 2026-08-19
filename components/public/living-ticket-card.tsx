"use client"

import {
  Ban,
  Camera,
  AlertTriangle,
  Calendar,
  Gift,
  Hourglass,
  MapPin,
  MoreHorizontal,
  Printer,
  ShieldCheck,
  Sparkles,
  User,
  Wifi,
  WifiOff,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"

import type { MyTicket } from "@/app/actions/tickets"
import { TestTicketWatermark } from "@/components/public/test-ticket-watermark"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { StaticSignedQR } from "@/components/public/static-signed-qr"
import { QrEnlargeTrigger, QrScanLightbox } from "@/components/public/qr-scan-lightbox"
import { ResaleTicketDialog } from "@/components/public/resale-ticket-dialog"
import { StoryFlyerTrigger } from "@/components/public/story-flyer-modal"
import { TransferTicketDialog, CancelTicketTransferButton } from "@/components/public/transfer-ticket-dialog"
import { WalletPassButtons } from "@/components/account/wallet-pass-buttons"
import { BrandMark } from "@/components/shared/brand-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { storyCategoryLabel } from "@/lib/story-canvas"
import { ticketSectorLabel, ticketVenueLine } from "@/lib/ticket-stub"
import { cn } from "@/lib/utils"

function isVipTier(tierName: string): boolean {
  return /\bvip\b/i.test(tierName)
}

function isUsedStatus(status: MyTicket["status"]): boolean {
  return status === "used" || status === "scanned"
}

function TicketManageSheet({
  ticket,
  offline,
  appleWalletEnabled,
  googleWalletEnabled,
  canTransfer,
  canResale,
  pendingTransfer,
  open,
  onOpenChange,
}: {
  ticket: MyTicket
  offline: boolean
  appleWalletEnabled: boolean
  googleWalletEnabled: boolean
  canTransfer: boolean
  canResale: boolean
  pendingTransfer: MyTicket["pendingTransfer"]
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
          {ticket.status === "valid" && !pendingTransfer ? (
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

              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-2xl"
                nativeButton={false}
                render={
                  <Link href={`/tickets/${ticket.id}/print`} target="_blank" />
                }
              >
                <Printer className="size-4" aria-hidden="true" />
                Imprimir boleto
              </Button>
            </div>
          ) : null}

          {pendingTransfer ? (
            <div className="mt-4 space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                Transferencia pendiente a {pendingTransfer.receiverEmail}
              </p>
              <CancelTicketTransferButton
                transferId={pendingTransfer.id}
                receiverEmail={pendingTransfer.receiverEmail}
              />
            </div>
          ) : canTransfer || (canResale && !ticket.activeResaleListingId) ? (
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
                  triggerLabel="Transferir a un amigo"
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

          {ticket.status === "valid" && !pendingTransfer ? (
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

          {ticket.isSponsoredByTokePass ? (
            <p className="mt-3 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800 dark:text-amber-200">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Comisión TokePass bonificada
            </p>
          ) : null}

          <p className="mt-4 text-center font-mono text-[10px] tracking-wider text-muted-foreground">
            #{ticket.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="mt-3 border-t border-border pt-3 text-center text-[10px] leading-4 text-muted-foreground">
            Entrada emitida bajo responsabilidad exclusiva del Organizador. La
            reventa solo es válida a través del marketplace oficial de TokePass.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function LivingTicketCard({
  ticket,
  showQr = true,
  offline = false,
  appleWalletEnabled = false,
  googleWalletEnabled = false,
  sequenceLabel,
}: {
  ticket: MyTicket
  userId: string
  showQr?: boolean
  offline?: boolean
  appleWalletEnabled?: boolean
  googleWalletEnabled?: boolean
  sequenceLabel?: string
}) {
  const [manageOpen, setManageOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const vip = isVipTier(ticket.tierName)
  const isFree = Number(ticket.tierPrice) === 0
  const pendingTransfer = ticket.pendingTransfer
  const canShowLiveQr = showQr && ticket.status === "valid" && !pendingTransfer
  const isStatic = ticket.qrType === "static"
  const canTransfer =
    ticket.status === "valid" &&
    ticket.transferCount < ticket.maxTransfersAllowed &&
    !offline &&
    !ticket.activeResaleListingId &&
    !pendingTransfer

  const canResale =
    ticket.status === "valid" &&
    ticket.tierPrice > 0 &&
    !ticket.isTest &&
    ticket.admissionsUsed === 0 &&
    ticket.transferCount < ticket.maxTransfersAllowed &&
    !offline &&
    !pendingTransfer

  const doorsAt = ticket.doorsOpenAt || ticket.eventDate
  const sector = sequenceLabel?.toUpperCase() || ticketSectorLabel(ticket)
  const venue = ticketVenueLine(ticket)

  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground",
        vip ? "border-amber-400/50" : "border-border/80",
        ticket.isTest && "border-amber-400/60",
        isFree && !ticket.isTest && "border-rose-500/40",
        pendingTransfer && "opacity-80",
      )}
    >
      {ticket.isTest ? <TestTicketWatermark /> : null}

      <div className="relative isolate h-40 overflow-hidden bg-zinc-950 sm:h-44">
        {ticket.flyerUrl ? (
          <Image
            src={ticket.flyerUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 90vw, 380px"
            className="object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/15" />
        <span className="absolute top-3 right-3 z-20">
          <BrandMark size="sm" className="size-8 rounded-[0.55rem] ring-0" />
        </span>
        {ticket.isTest ? (
          <Badge className="absolute left-3 top-3 z-20 rounded-full border-0 bg-amber-500 text-[10px] font-bold uppercase tracking-wide text-amber-950">
            <AlertTriangle className="size-3" aria-hidden="true" />
            Prueba
          </Badge>
        ) : isFree ? (
          <Badge className="absolute left-3 top-3 z-20 rounded-full border-0 bg-rose-500 text-[10px] font-bold uppercase tracking-wide text-white">
            <Ban className="size-3" aria-hidden="true" />
            $0
          </Badge>
        ) : null}
      </div>

      <div className="space-y-3 px-5 pt-4">
        <h2 className="text-xl font-black leading-tight tracking-tight text-foreground">
          {ticket.eventTitle}
        </h2>
        <dl className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Calendar className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="sr-only">Fecha</dt>
              <dd className="font-semibold capitalize text-foreground">
                {formatEventDay(ticket.eventDate)}
              </dd>
              <p className="text-xs text-muted-foreground">
                Puertas {formatEventTime(doorsAt)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="sr-only">Lugar</dt>
              <dd className="font-medium leading-snug text-foreground">{venue}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="sr-only">Asistente</dt>
              <dd className="font-bold text-foreground">{ticket.holderName}</dd>
              {ticket.holderDni ? (
                <p className="text-xs font-semibold tabular-nums text-muted-foreground">
                  DNI {ticket.holderDni}
                </p>
              ) : null}
            </div>
          </div>
        </dl>

        {ticket.dayValidityLabel ? (
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
            {ticket.dayValidityLabel}
          </p>
        ) : null}

        {pendingTransfer ? (
          <Badge
            variant="outline"
            className="rounded-full border-amber-500/40 bg-amber-500/10 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200"
          >
            <Hourglass className="size-3" aria-hidden="true" />
            Transferencia pendiente
          </Badge>
        ) : isUsedStatus(ticket.status) || ticket.status === "transferred" ? (
          <Badge
            variant="outline"
            className="rounded-full text-[10px] font-semibold uppercase tracking-wide"
          >
            {ticket.status === "transferred" ? "Transferida" : "Usada"}
          </Badge>
        ) : null}
      </div>

      <div
        className={cn(
          "mt-4 px-5 py-2.5 text-center text-sm font-black uppercase tracking-[0.16em]",
          vip
            ? "bg-amber-500 text-amber-950"
            : "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950",
        )}
      >
        {sector}
      </div>

      <div className="stub-divider" aria-hidden="true" />

      <div className="flex flex-1 flex-col items-center px-5 pb-2 pt-1">
        {canShowLiveQr ? (
          <div
            className="w-full"
            onContextMenu={(event) => event.preventDefault()}
          >
            <QrEnlargeTrigger onOpen={() => setScanOpen(true)} className="mx-auto w-fit">
              {isStatic ? (
                <StaticSignedQR
                  ticketId={ticket.id}
                  totpSecret={ticket.totpSecret}
                  size={200}
                />
              ) : (
                <LivingTicketQR
                  ticketId={ticket.id}
                  totpSecret={ticket.totpSecret}
                  size={200}
                />
              )}
            </QrEnlargeTrigger>
            <div className="mt-2 flex justify-center">
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
              holderName={ticket.holderName}
              holderDni={ticket.holderDni}
            />
          </div>
        ) : (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {pendingTransfer
              ? `Transferencia pendiente a ${pendingTransfer.receiverEmail}. El QR está oculto hasta que reclamen o canceles.`
              : ticket.status === "transferred"
                ? "Esta entrada fue transferida. El QR quedó anulado."
                : "Esta entrada ya no muestra QR vivo en puerta."}
          </p>
        )}
      </div>

      <div className="no-print px-4 pb-4">
        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground"
          onClick={() => setManageOpen(true)}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
          Gestionar entrada
        </Button>
      </div>

      <TicketManageSheet
        ticket={ticket}
        offline={offline}
        appleWalletEnabled={appleWalletEnabled}
        googleWalletEnabled={googleWalletEnabled}
        canTransfer={canTransfer}
        canResale={canResale}
        pendingTransfer={pendingTransfer}
        open={manageOpen}
        onOpenChange={setManageOpen}
      />
    </article>
  )
}
