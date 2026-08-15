"use client"

import { CalendarDays, MapPin, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"

import type { MyTicket } from "@/app/actions/tickets"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import {
  QrEnlargeTrigger,
  QrScanLightbox,
} from "@/components/public/qr-scan-lightbox"
import { formatEventDay, formatEventTime } from "@/lib/format"

function GuestTicketCard({ ticket }: { ticket: MyTicket }) {
  const [scanOpen, setScanOpen] = useState(false)
  const canShowQr = ticket.status === "valid" && Boolean(ticket.totpSecret)
  const isStatic = ticket.qrType === "static"

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="space-y-1 border-b border-border px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {ticket.tierName}
        </p>
        <h2 className="text-xl font-black tracking-tight">{ticket.eventTitle}</h2>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          {formatEventDay(ticket.eventDate)} · {formatEventTime(ticket.eventDate)}
        </p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <span>{ticket.venueName ?? ticket.eventLocation}</span>
        </p>
      </div>

      {canShowQr ? (
        <div className="p-5 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {isStatic ? "QR de ingreso" : "Living QR"}
          </p>
          <div className="mx-auto mt-4 w-full max-w-[220px] rounded-2xl bg-white p-2">
            <QrEnlargeTrigger onOpen={() => setScanOpen(true)} className="w-full">
              {isStatic ? (
                <QRCodeSVG
                  value={ticket.totpSecret}
                  size={200}
                  level="H"
                  includeMargin
                  bgColor="#ffffff"
                  fgColor="#09090b"
                  className="h-auto w-full"
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
          />
          <p className="mt-3 font-mono text-xs tracking-wider text-muted-foreground">
            #{ticket.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="mt-3 flex items-start justify-center gap-2 text-left text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {isStatic
              ? "Presentá este código en puerta. También sirve el PDF impreso."
              : "Abrí esta pantalla al llegar. El código cambia cada 15 segundos."}
          </p>
        </div>
      ) : (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          Esta entrada ya no muestra QR vivo
          {ticket.status === "transferred" ? " (fue transferida)" : ""}.
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
