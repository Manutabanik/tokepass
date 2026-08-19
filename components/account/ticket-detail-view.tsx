"use client"

import {
  ArrowLeft,
  Calendar,
  MapPin,
  Printer,
  ShieldCheck,
  User,
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
import { TransferTicketDialog, CancelTicketTransferButton } from "@/components/public/transfer-ticket-dialog"
import { useOnlineStatus } from "@/components/pwa/use-online-status"
import { BrandMark } from "@/components/shared/brand-logo"
import { Button } from "@/components/ui/button"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { storyCategoryLabel } from "@/lib/story-canvas"
import { getTicketsOffline } from "@/lib/offline-store"
import type { PublicSponsor } from "@/lib/sponsors"
import { ticketSectorLabel, ticketVenueLine } from "@/lib/ticket-stub"
import { ticketBackupCode } from "@/lib/ticket-print"

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

  const canShowQr =
    ticket.status === "valid" && otpUnlocked && !ticket.pendingTransfer
  const isStatic = ticket.qrType === "static"
  const canTransfer =
    ticket.status === "valid" &&
    ticket.transferCount < ticket.maxTransfersAllowed &&
    online &&
    !ticket.activeResaleListingId &&
    !ticket.pendingTransfer

  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    ticket.venueName
      ? `${ticket.venueName}, ${ticket.eventLocation}`
      : ticket.eventLocation,
  )}`

  const seatingLabel = [
    ticket.seatingLabel,
    ticket.seatingRowLabel ? `Fila ${ticket.seatingRowLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const doorsAt = ticket.doorsOpenAt || ticket.eventDate
  const sector = ticketSectorLabel(ticket)
  const venue = ticketVenueLine(ticket)

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 py-6">
      <Link
        href="/cuenta/entradas"
        className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a mis entradas
      </Link>

      <article className="relative overflow-hidden rounded-2xl border border-border bg-card">
        {ticket.isTest ? <TestTicketWatermark /> : null}
        <div className="relative isolate h-44 overflow-hidden bg-zinc-950">
          {ticket.flyerUrl ? (
            <Image
              src={ticket.flyerUrl}
              alt=""
              fill
              priority
              sizes="(max-width: 640px) 100vw, 512px"
              className="object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/15" />
          <span className="absolute top-3 right-3 z-20">
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
                {formatEventDay(ticket.eventDate)}
              </span>
              <span className="text-xs text-muted-foreground">
                Puertas {formatEventTime(doorsAt)}
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
          {seatingLabel ? (
            <span className="mt-1 block text-[10px] font-semibold tracking-normal text-white/70 dark:text-zinc-600">
              {seatingLabel}
            </span>
          ) : null}
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
      ) : canShowQr ? (
        <div className="rounded-3xl border border-border bg-card p-5 text-center text-card-foreground shadow-2xl shadow-black/20">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {isStatic ? "QR de ingreso" : "Living QR"}
          </p>
          <div className="mx-auto mt-4 w-full max-w-[220px] rounded-2xl bg-white p-2">
            <QrEnlargeTrigger onOpen={() => setScanOpen(true)} className="w-full">
              {isStatic ? (
                <StaticSignedQR
                  ticketId={ticket.id}
                  totpSecret={ticket.totpSecret}
                  size={200}
                  className="w-full max-w-none p-0 shadow-none"
                />
              ) : (
                <LivingTicketQR
                  ticketId={ticket.id}
                  totpSecret={ticket.totpSecret}
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
            totpSecret={ticket.totpSecret}
            holderName={ticket.holderName}
            holderDni={ticket.holderDni}
          />
          <p className="mt-3 font-mono text-xs tracking-wider text-muted-foreground">
            {ticketBackupCode(ticket.id)}
          </p>
          <p className="mt-3 flex items-start justify-center gap-2 text-left text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {isStatic
              ? "Presentá este código en puerta. También sirve el PDF impreso."
              : "Abrí esta pantalla al llegar. El código cambia cada 15 segundos."}
          </p>
          {!online ? (
            <p
              role="status"
              className="mt-3 inline-flex rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-amber-100"
            >
              Modo sin conexión - QR disponible para lectura
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
      ) : (
        <div className="rounded-3xl border border-dashed border-border bg-muted/40 px-5 py-10 text-center text-sm text-muted-foreground">
          {ticket.pendingTransfer
            ? `Transferencia pendiente a ${ticket.pendingTransfer.receiverEmail}. El Living QR está oculto.`
            : `Esta entrada ya no muestra QR vivo${ticket.status === "transferred" ? " (fue transferida)" : ""}.`}
        </div>
      )}

      <div className="grid gap-3">
        {ticket.pendingTransfer && online ? (
          <CancelTicketTransferButton
            transferId={ticket.pendingTransfer.id}
            receiverEmail={ticket.pendingTransfer.receiverEmail}
            className="min-h-12 w-full rounded-2xl"
          />
        ) : null}
        {canTransfer ? (
          <TransferTicketDialog
            ticketId={ticket.id}
            eventTitle={ticket.eventTitle}
            triggerLabel="Transferir a un amigo"
            triggerClassName="min-h-12 w-full rounded-2xl"
          />
        ) : null}

        {ticket.status === "valid" && !ticket.pendingTransfer ? (
          <>
            <WalletPassButtons
              ticketId={ticket.id}
              flyerUrl={ticket.flyerUrl}
              disabled={!online}
              appleWalletEnabled={appleWalletEnabled}
              googleWalletEnabled={googleWalletEnabled}
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
            />
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
          </>
        ) : null}

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
          <li>El primer escaneo válido en puerta otorga el ingreso.</li>
          <li>
            La entrada es personal. Transferila solo desde TokePass.
          </li>
          <li>
            El organizador es responsable del evento y de las condiciones de
            acceso.
          </li>
        </ul>
      </section>
    </div>
  )
}
