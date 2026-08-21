"use client"

import {
  Ban,
  Camera,
  AlertTriangle,
  Calendar,
  Clock,
  Download,
  LoaderCircle,
  MapPin,
  MoreHorizontal,
  Send,
  ShoppingBag,
  Store,
  Undo2,
  User,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react"
import Image from "next/image"
import { useState } from "react"

import type { MyTicket } from "@/app/actions/tickets"
import { TestTicketWatermark } from "@/components/public/test-ticket-watermark"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { StaticSignedQR } from "@/components/public/static-signed-qr"
import { QrEnlargeTrigger, QrScanLightbox } from "@/components/public/qr-scan-lightbox"
import { ResaleConfirmDialog } from "@/components/public/resale-confirm-dialog"
import { TransferShareConfirmDialog } from "@/components/public/transfer-share-confirm-dialog"
import { StoryFlyerTrigger } from "@/components/public/story-flyer-modal"
import { useTicketResaleVisual } from "@/components/public/use-ticket-resale-visual"
import { useTicketTransferVisual } from "@/components/public/use-ticket-transfer-visual"
import { BrandMark } from "@/components/shared/brand-logo"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { storyCategoryLabel } from "@/lib/story-canvas"
import { ticketSectorLabel, ticketVenueLine } from "@/lib/ticket-stub"
import { cn } from "@/lib/utils"
import { eventAccessTimeLabel, isOnlineDelivery } from "@/lib/events/delivery-mode"
import { OnlineAccessButton } from "@/components/account/online-access-button"

function isVipTier(tierName: string): boolean {
  return /\bvip\b/i.test(tierName)
}

function isUsedStatus(status: MyTicket["status"]): boolean {
  return status === "used" || status === "scanned"
}

function storyFlyerData(ticket: MyTicket) {
  return {
    eventTitle: ticket.eventTitle,
    eventDate: ticket.eventDate,
    eventLocation: ticket.venueName ?? ticket.eventLocation ?? "Online",
    imageUrl: ticket.flyerUrl,
    customStoryUrl: ticket.socialShareImageUrl,
    mode: "buyer" as const,
    organizerName: ticket.organizerName,
    organizerAvatarUrl: ticket.organizerAvatarUrl,
    eventId: ticket.eventId,
    categoryLabel: storyCategoryLabel({
      tierName: ticket.tierName,
      seatingLabel: ticket.seatingLabel,
      seatingSectorName: ticket.seatingSectorName,
    }),
  }
}

function TicketActionStack({
  ticket,
  offline,
  canTransfer,
  canResale,
  sending,
  onSend,
  onResale,
}: {
  ticket: MyTicket
  offline: boolean
  canTransfer: boolean
  canResale: boolean
  sending: boolean
  onSend: () => void
  onResale: () => void
}) {
  function savePdf() {
    window.open(`/tickets/${ticket.id}/print`, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="mt-4 flex w-full flex-col gap-3">
      <Button
        type="button"
        disabled={!canTransfer || sending}
        onClick={onSend}
        className="h-11 w-full rounded-xl border-transparent bg-green-600 text-white hover:bg-green-700 hover:text-white"
      >
        {sending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
        Enviar a un amigo
      </Button>

      <StoryFlyerTrigger
        data={storyFlyerData(ticket)}
        label="Compartir en Historias"
        icon={<Camera className="size-4 shrink-0" aria-hidden />}
        variant="solid"
        className="h-11 w-full rounded-xl bg-purple-600 text-sm font-semibold text-white hover:bg-purple-700"
      />

      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-200">
          <MoreHorizontal className="size-4" aria-hidden="true" />
          Opciones
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-[min(calc(100vw-2.5rem),20rem)]">
          <DropdownMenuItem onClick={savePdf}>
            <Download className="size-4 text-muted-foreground" aria-hidden="true" />
            Guardar como PDF
          </DropdownMenuItem>
          {canResale ? (
            <DropdownMenuItem
              disabled={offline}
              className="text-orange-600 data-highlighted:text-orange-700"
              onClick={onResale}
            >
              <Store className="size-4" aria-hidden="true" />
              Revender mi entrada
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function LivingTicketCard({
  ticket,
  showQr = true,
  offline = false,
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
  const [scanOpen, setScanOpen] = useState(false)
  const [resaleConfirmOpen, setResaleConfirmOpen] = useState(false)
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false)
  const transfer = useTicketTransferVisual(ticket)
  const resale = useTicketResaleVisual(ticket)
  const visualStatus =
    transfer.optimisticVisual ?? resale.optimisticVisual ?? ticket.visualStatus
  const vip = isVipTier(ticket.tierName)
  const isFree = Number(ticket.tierPrice) === 0
  const transferPending = visualStatus === "transfer_pending"
  const resalePending = visualStatus === "resale_pending"
  const onlineEvent = isOnlineDelivery(ticket.deliveryMode)
  const canShowLiveQr =
    !onlineEvent &&
    ticket.status === "valid" &&
    visualStatus === "active" &&
    Boolean(ticket.totpSecret) &&
    (showQr ||
      Boolean(ticket.pendingTransfer) ||
      Boolean(ticket.activeResaleListingId))
  const isStatic = ticket.qrType === "static"
  const canTransfer =
    ticket.status === "valid" &&
    ticket.admissionsUsed === 0 &&
    ticket.transferCount < ticket.maxTransfersAllowed &&
    !offline &&
    visualStatus === "active"

  const canResale =
    ticket.status === "valid" &&
    ticket.tierPrice > 0 &&
    !ticket.isTest &&
    ticket.admissionsUsed === 0 &&
    ticket.transferCount < ticket.maxTransfersAllowed &&
    !offline &&
    visualStatus === "active"

  const totpSecret = ticket.totpSecret ?? ""
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
        (transferPending || resalePending) && "opacity-80",
      )}
    >
      {ticket.isTest ? <TestTicketWatermark /> : null}

      <div className="relative isolate h-40 overflow-hidden bg-muted sm:h-44">
        {ticket.flyerUrl ? (
          <Image
            src={ticket.flyerUrl}
            alt={ticket.eventTitle}
            fill
            sizes="(max-width: 768px) 90vw, 380px"
            className="object-cover"
          />
        ) : null}
        <span className="absolute top-3 right-3 z-20 rounded-xl bg-black/40 p-1 shadow-lg backdrop-blur-md">
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
        <h2 className="min-w-0 break-words text-xl font-black leading-tight tracking-tight text-foreground">
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
                {eventAccessTimeLabel(ticket.deliveryMode)}{" "}
                {formatEventTime(doorsAt)}
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

        {isUsedStatus(ticket.status) || ticket.status === "transferred" ? (
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

      <div className="flex flex-1 flex-col items-center px-5 pb-4 pt-1">
        {onlineEvent &&
        ticket.status === "valid" &&
        visualStatus === "active" ? (
          <div className="w-full pt-2">
            <OnlineAccessButton href={ticket.accessLink} />
          </div>
        ) : canShowLiveQr ? (
          <div
            className="w-full"
            onContextMenu={(event) => event.preventDefault()}
          >
            <QrEnlargeTrigger onOpen={() => setScanOpen(true)} className="mx-auto block w-full max-w-sm">
              {isStatic ? (
                <StaticSignedQR
                  ticketId={ticket.id}
                  totpSecret={totpSecret}
                  size={200}
                />
              ) : (
                <LivingTicketQR
                  ticketId={ticket.id}
                  totpSecret={totpSecret}
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
              totpSecret={totpSecret}
              holderName={ticket.holderName}
              holderDni={ticket.holderDni}
            />
          </div>
        ) : transferPending ? (
          <div className="w-full space-y-3">
            <div
              role="status"
              className="flex items-start gap-3 rounded-2xl border border-amber-400/50 bg-amber-100 px-4 py-3 text-left text-sm font-semibold leading-5 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100"
            >
              <Clock className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              Esperando que tu amigo acepte la entrada
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={transfer.pending || !transfer.transferId}
              onClick={transfer.cancelSend}
              className="h-11 w-full rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10"
            >
              {transfer.pending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <XCircle className="size-4" aria-hidden="true" />
              )}
              Cancelar envío
            </Button>
          </div>
        ) : resalePending ? (
          <div className="w-full space-y-3">
            <div
              role="status"
              className="flex flex-col items-center gap-3 rounded-2xl bg-slate-100 px-4 py-6 text-center text-sm font-semibold leading-5 text-slate-800"
            >
              <ShoppingBag className="size-8 text-slate-600" aria-hidden="true" />
              Entrada en venta. Relajate, nosotros nos encargamos.
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={resale.pending || !resale.listingId}
              onClick={resale.withdraw}
              className="h-11 w-full rounded-xl"
            >
              {resale.pending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Undo2 className="size-4" aria-hidden="true" />
              )}
              Sacar de la venta
            </Button>
          </div>
        ) : (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {ticket.status === "transferred"
              ? "Esta entrada fue transferida. El QR quedó anulado."
              : "Esta entrada ya no muestra QR vivo en puerta."}
          </p>
        )}
        {ticket.status === "valid" && visualStatus === "active" ? (
          <TicketActionStack
            ticket={ticket}
            offline={offline}
            canTransfer={canTransfer}
            canResale={canResale}
            sending={transfer.pending}
            onSend={() => setTransferConfirmOpen(true)}
            onResale={() => setResaleConfirmOpen(true)}
          />
        ) : null}
      </div>

      <TransferShareConfirmDialog
        open={transferConfirmOpen}
        onOpenChange={setTransferConfirmOpen}
        eventTitle={ticket.eventTitle}
        pending={transfer.pending}
        onConfirm={() => {
          setTransferConfirmOpen(false)
          transfer.sendToFriend(ticket.id, ticket.eventTitle)
        }}
      />
      <ResaleConfirmDialog
        open={resaleConfirmOpen}
        onOpenChange={setResaleConfirmOpen}
        eventTitle={ticket.eventTitle}
        nominalValue={ticket.tierPrice}
        pending={resale.pending}
        onConfirm={() => {
          setResaleConfirmOpen(false)
          resale.publish(ticket.id)
        }}
      />
    </article>
  )
}
