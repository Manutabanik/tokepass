"use client"

import {
  ArrowLeft,
  Calendar,
  Clock,
  LoaderCircle,
  MapPin,
  Printer,
  Send,
  ShieldCheck,
  ShoppingBag,
  Undo2,
  User,
  XCircle,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import type { MyTicket } from "@/app/actions/tickets"
import { GuestOtpGate } from "@/components/account/guest-otp-gate"
import { TestTicketWatermark } from "@/components/public/test-ticket-watermark"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { StaticSignedQR } from "@/components/public/static-signed-qr"
import { QrEnlargeTrigger, QrScanLightbox } from "@/components/public/qr-scan-lightbox"
import { WalletPassButtons } from "@/components/account/wallet-pass-buttons"
import { SaveTicketButton } from "@/components/public/save-ticket-button"
import { SponsorGrid } from "@/components/public/sponsor-grid"
import { StoryFlyerWalletButton } from "@/components/public/story-flyer-modal"
import { TransferShareConfirmDialog } from "@/components/public/transfer-share-confirm-dialog"
import { useTicketResaleVisual } from "@/components/public/use-ticket-resale-visual"
import { useTicketTransferVisual } from "@/components/public/use-ticket-transfer-visual"
import { useOnlineStatus } from "@/components/pwa/use-online-status"
import { BrandMark } from "@/components/shared/brand-logo"
import { Button } from "@/components/ui/button"
import { resolveTicketDate } from "@/lib/event-schedule"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { storyCategoryLabel } from "@/lib/story-canvas"
import { getTicketsOffline } from "@/lib/offline-store"
import type { PublicSponsor } from "@/lib/sponsors"
import { ticketVenueLine } from "@/lib/ticket-stub"
import { ticketAdmissionTitle } from "@/lib/ticket-wallet"
import { ticketBackupCode } from "@/lib/ticket-print"
import { eventAccessTimeLabel, isOnlineDelivery } from "@/lib/events/delivery-mode"
import { OnlineAccessButton } from "@/components/account/online-access-button"
import { ticketAllowsStaticAdmissionExport } from "@/lib/tickets/static-tps-policy"

export function TicketDetailView({
  ticket: initialTicket,
  userId,
  appleWalletEnabled = false,
  googleWalletEnabled = false,
  sponsors = [],
  requireGuestOtp = false,
}: {
  ticket: MyTicket
  userId: string
  appleWalletEnabled?: boolean
  googleWalletEnabled?: boolean
  sponsors?: PublicSponsor[]
  requireGuestOtp?: boolean
}) {
  const online = useOnlineStatus()
  const router = useRouter()
  const [offlineTicket, setOfflineTicket] = useState<MyTicket | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [otpUnlocked, setOtpUnlocked] = useState(!requireGuestOtp)
  const ticket =
    !online && offlineTicket?.id === initialTicket.id
      ? offlineTicket
      : initialTicket

  useEffect(() => {
    if (online) return
    let cancelled = false
    void getTicketsOffline(userId).then((cached) => {
      const local = cached.find((row) => row.id === initialTicket.id)
      if (!cancelled && local) setOfflineTicket(local)
    })
    return () => {
      cancelled = true
    }
  }, [online, userId, initialTicket.id])

  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false)
  const transfer = useTicketTransferVisual(ticket)
  const resale = useTicketResaleVisual(ticket)
  const visualStatus =
    transfer.optimisticVisual ?? resale.optimisticVisual ?? ticket.visualStatus
  const transferPending = visualStatus === "transfer_pending"
  const resalePending = visualStatus === "resale_pending"
  const onlineEvent = isOnlineDelivery(ticket.deliveryMode)
  const canShowQr =
    !onlineEvent &&
    ticket.status === "valid" &&
    otpUnlocked &&
    visualStatus === "active" &&
    Boolean(ticket.totpSecret)
  const isStatic = ticket.qrType === "static"
  const allowStaticExport = ticketAllowsStaticAdmissionExport(ticket)
  const canTransfer =
    ticket.status === "valid" &&
    ticket.admissionsUsed === 0 &&
    ticket.transferCount < ticket.maxTransfersAllowed &&
    online &&
    visualStatus === "active"

  const mapsQuery = ticket.venueName
    ? `${ticket.venueName}, ${ticket.eventLocation ?? ""}`
    : (ticket.eventLocation ?? "")
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    mapsQuery,
  )}`

  const totpSecret = ticket.totpSecret ?? ""
  const doorsAt = resolveTicketDate(ticket)
  const sector = ticketAdmissionTitle(ticket).toUpperCase()
  const venue = ticketVenueLine(ticket)

  return (
    <div className="mx-auto w-full max-w-sm space-y-6 py-6">
      <Link
        href="/cuenta/entradas"
        className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a mis entradas
      </Link>

      <article className="relative overflow-hidden rounded-2xl border border-border bg-card">
        {ticket.isTest ? <TestTicketWatermark /> : null}
        <div className="relative isolate h-44 overflow-hidden bg-muted">
          {ticket.flyerUrl ? (
            <Image
              src={ticket.flyerUrl}
              alt={ticket.eventTitle}
              fill
              priority
              sizes="(max-width: 640px) 100vw, 512px"
              className="object-cover"
            />
          ) : null}
          <span className="absolute top-3 right-3 z-20 rounded-xl bg-black/40 p-1 shadow-lg backdrop-blur-md">
            <BrandMark size="sm" className="size-8 rounded-[0.55rem] ring-0" />
          </span>
        </div>
        <div className="space-y-3 px-5 pt-4 text-sm text-foreground">
          <h1 className="min-w-0 break-words text-2xl font-black tracking-tight">
            {ticket.eventTitle}
          </h1>
          <p className="flex items-start gap-2">
            <Calendar className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block font-semibold capitalize">
                {formatEventDay(doorsAt)}
              </span>
              <span className="text-xs text-muted-foreground">
                {eventAccessTimeLabel(ticket.deliveryMode)}{" "}
                {formatEventTime(doorsAt)}
              </span>
            </span>
          </p>
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium leading-snug">{venue}</span>
          </p>
          <p className="flex items-start gap-2">
            <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block font-bold">{ticket.holderName}</span>
              {ticket.holderDni ? (
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  DNI {ticket.holderDni}
                </span>
              ) : null}
            </span>
          </p>
        </div>
        <div className="mt-4 bg-zinc-950 px-5 py-2.5 text-center text-sm font-black uppercase tracking-[0.16em] text-white dark:bg-white dark:text-zinc-950">
          {sector}
        </div>
      </article>

      {ticket.status === "valid" && requireGuestOtp && !otpUnlocked && ticket.orderId ? (
        <GuestOtpGate
          orderId={ticket.orderId}
          onVerified={() => {
            setOtpUnlocked(true)
            router.refresh()
          }}
        />
      ) : onlineEvent &&
        ticket.status === "valid" &&
        otpUnlocked &&
        visualStatus === "active" ? (
        <OnlineAccessButton href={ticket.accessLink} />
      ) : canShowQr ? (
        <div className="rounded-3xl border border-border bg-card p-5 text-center text-card-foreground shadow-2xl shadow-black/20">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {isStatic ? "QR de ingreso" : "Código de acceso dinámico"}
          </p>
          <div className="mx-auto mt-4 aspect-square w-full rounded-2xl bg-white p-4">
            <QrEnlargeTrigger onOpen={() => setScanOpen(true)} className="block h-full w-full">
              {isStatic ? (
                <StaticSignedQR
                  ticketId={ticket.id}
                  totpSecret={totpSecret}
                  size={200}
                  className="w-full max-w-none p-0 shadow-none"
                />
              ) : (
                <LivingTicketQR
                  ticketId={ticket.id}
                  totpSecret={totpSecret}
                  size={200}
                />
              )}
            </QrEnlargeTrigger>
          </div>
          <QrScanLightbox
            open={scanOpen}
            onOpenChange={setScanOpen}
            isStatic={isStatic}
            ticketId={ticket.id}
            totpSecret={totpSecret}
            title={sector}
            holderName={ticket.holderName}
            holderDni={ticket.holderDni}
            isSandbox={ticket.isTest}
          />
          <p className="mt-3 font-mono text-xs tracking-wider text-muted-foreground">
            {ticketBackupCode(ticket.id)}
          </p>
          <p className="mt-3 flex items-start justify-center gap-2 text-left text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {isStatic
              ? "Presentá este código en puerta. También sirve el PDF impreso."
              : "En puerta mostrá esta pantalla. El código se actualiza solo para evitar reventas truchas (no le saques captura de pantalla)."}
          </p>
          {!online ? (
            <p
              role="status"
              className="mt-3 inline-flex rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-amber-100"
            >
              Modo sin señal (Tu código sigue funcionando igual)
            </p>
          ) : null}
          {sponsors.length > 0 ? (
            <div className="mt-4 border-t border-border pt-3">
              <SponsorGrid
                heading="Auspician este evento:"
                sponsors={sponsors}
                size="sm"
              />
            </div>
          ) : null}
        </div>
      ) : transferPending ? (
        <div className="space-y-3 rounded-3xl border border-amber-400/50 bg-amber-100 p-5 dark:border-amber-500/40 dark:bg-amber-500/15">
          <div
            role="status"
            className="flex items-start gap-3 text-left text-sm font-semibold leading-5 text-amber-950 dark:text-amber-100"
          >
            <Clock className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            Esperando que tu amigo acepte la entrada
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={transfer.pending || !transfer.transferId}
            onClick={transfer.cancelSend}
            className="min-h-12 w-full rounded-2xl text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10"
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
        <div className="space-y-3 rounded-3xl bg-slate-100 p-5">
          <div
            role="status"
            className="flex flex-col items-center gap-3 text-center text-sm font-semibold leading-5 text-slate-800"
          >
            <ShoppingBag className="size-8 text-slate-600" aria-hidden="true" />
            Entrada en venta. Relajate, nosotros nos encargamos.
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={resale.pending || !resale.listingId}
            onClick={resale.withdraw}
            className="min-h-12 w-full rounded-2xl"
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
        <div className="rounded-3xl border border-dashed border-border bg-muted/40 px-5 py-10 text-center text-sm text-muted-foreground">
          {ticket.status === "transferred"
            ? "Esta entrada ya no es tuya: se la transferiste a un amigo."
            : "Esta entrada ya no muestra el código de acceso."}
        </div>
      )}

      <div className="grid gap-3">
        {canTransfer ? (
          <Button
            type="button"
            disabled={transfer.pending}
            onClick={() => setTransferConfirmOpen(true)}
            className="min-h-12 w-full rounded-2xl bg-green-600 text-white hover:bg-green-700"
          >
            {transfer.pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
            Enviar por WhatsApp o email
          </Button>
        ) : null}

        {ticket.status === "valid" && visualStatus === "active" && !onlineEvent ? (
          <>
            <WalletPassButtons
              ticketId={ticket.id}
              flyerUrl={ticket.flyerUrl}
              disabled={!online}
              appleWalletEnabled={appleWalletEnabled}
              googleWalletEnabled={googleWalletEnabled}
              allowStaticExport={allowStaticExport}
            />
            <SaveTicketButton
              ticket={ticket}
              userId={userId}
              disabled={!online}
              appleWalletEnabled={appleWalletEnabled}
              googleWalletEnabled={googleWalletEnabled}
            />
            <StoryFlyerWalletButton
              data={{
                eventTitle: ticket.eventTitle,
                eventDate: ticket.eventDate,
                eventLocation: ticket.venueName ?? ticket.eventLocation ?? "Online",
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
            />
            {allowStaticExport ? (
            <Button
              className="min-h-12 w-full rounded-2xl border-border bg-background text-foreground hover:bg-muted"
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/tickets/${ticket.id}/print`} target="_blank" />
              }
            >
              <Printer className="size-4" />
              Guardar / Imprimir
            </Button>
            ) : null}
          </>
        ) : null}

        {onlineEvent ? null : (
          <Button
            className="min-h-12 w-full rounded-2xl"
            variant="outline"
            nativeButton={false}
            render={
              <a href={mapsHref} target="_blank" rel="noreferrer" />
            }
          >
            <MapPin className="size-4" />
            Ver ubicación en el mapa
          </Button>
        )}

        <Button
          className="min-h-12 w-full rounded-2xl"
          variant="ghost"
          nativeButton={false}
          render={<Link href={`/events/${ticket.eventId}`} />}
        >
          Ver evento
        </Button>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <h2 className="text-sm font-semibold text-foreground">Términos de acceso</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-relaxed">
          <li>
            {onlineEvent
              ? "El acceso a la transmisión se habilita con el link de esta entrada."
              : "El primer escaneo válido en puerta otorga el ingreso."}
          </li>
          <li>
            La entrada es personal. Transferila solo desde TokePass.
          </li>
          <li>
            El organizador es responsable del evento y de las condiciones de
            acceso.
          </li>
        </ul>
      </section>

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
    </div>
  )
}
