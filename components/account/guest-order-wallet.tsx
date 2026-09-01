"use client"

import { Calendar, MapPin, ShieldCheck, User } from "lucide-react"
import Image from "next/image"
import { useState } from "react"

import type { MyTicket } from "@/app/actions/tickets"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { StaticSignedQR } from "@/components/public/static-signed-qr"
import {
  QrEnlargeTrigger,
  QrScanLightbox,
} from "@/components/public/qr-scan-lightbox"
import { BrandMark } from "@/components/shared/brand-logo"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { ticketBackupCode } from "@/lib/ticket-print"
import { ticketVenueLine } from "@/lib/ticket-stub"
import { ticketAdmissionTitle } from "@/lib/ticket-wallet"
import { eventAccessTimeLabel, isOnlineDelivery } from "@/lib/events/delivery-mode"
import { OnlineAccessButton } from "@/components/account/online-access-button"

function GuestTicketCard({ ticket }: { ticket: MyTicket }) {
  const [scanOpen, setScanOpen] = useState(false)
  const onlineEvent = isOnlineDelivery(ticket.deliveryMode)
  const canShowQr =
    !onlineEvent && ticket.status === "valid" && Boolean(ticket.totpSecret)
  const isStatic = ticket.qrType === "static"
  const totpSecret = ticket.totpSecret ?? ""
  const doorsAt = ticket.doorsOpenAt || ticket.eventDate
  const sector = ticketAdmissionTitle(ticket).toUpperCase()
  const venue = ticketVenueLine(ticket)

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative isolate h-40 overflow-hidden bg-muted">
        {ticket.flyerUrl ? (
          <Image
            src={ticket.flyerUrl}
            alt={ticket.eventTitle}
            fill
            sizes="(max-width: 640px) 100vw, 512px"
            className="object-cover"
          />
        ) : null}
        <span className="absolute top-3 right-3 z-20 rounded-xl bg-black/40 p-1 shadow-lg backdrop-blur-md">
          <BrandMark size="sm" className="size-8 rounded-[0.55rem] ring-0" />
        </span>
      </div>
      <div className="space-y-3 px-5 pt-4">
        <h2 className="min-w-0 break-words text-xl font-black tracking-tight">
          {ticket.eventTitle}
        </h2>
        <p className="flex items-start gap-2 text-sm">
          <Calendar className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="block font-semibold capitalize">
              {formatEventDay(ticket.eventDate)}
            </span>
            <span className="text-xs text-muted-foreground">
              {eventAccessTimeLabel(ticket.deliveryMode)}{" "}
              {formatEventTime(doorsAt)}
            </span>
          </span>
        </p>
        <p className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium leading-snug">{venue}</span>
        </p>
        <p className="flex items-start gap-2 text-sm">
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

      {onlineEvent && ticket.status === "valid" ? (
        <div className="p-5">
          <OnlineAccessButton href={ticket.accessLink} />
        </div>
      ) : canShowQr ? (
        <div className="p-5 text-center">
          <div className="mx-auto aspect-square w-full max-w-sm rounded-2xl bg-white p-4">
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
            isTest={ticket.isTest}
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
        </div>
      ) : (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          {ticket.status === "transferred"
            ? "Esta entrada ya no es tuya: se la transferiste a un amigo."
            : "Esta entrada ya no muestra el código de acceso."}
        </div>
      )}
    </article>
  )
}

export function GuestOrderWallet({ tickets }: { tickets: MyTicket[] }) {
  return (
    <div className="space-y-4">
      {tickets.map((ticket) => (
        <GuestTicketCard key={ticket.id} ticket={ticket} />
      ))}
    </div>
  )
}
