"use client"

import Image from "next/image"
import { QRCodeSVG } from "qrcode.react"

import type { PrintableTicket } from "@/app/actions/pos"
import { BRAND_MARK_SRC } from "@/components/shared/brand-logo"
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"

/**
 * Ticket térmico 80mm (fallback visual ~58mm vía CSS print).
 * QR = totp_secret crudo (is_dynamic_qr=false en POS) → aceptado en puerta.
 */
export function PrintableTicketView({ ticket }: { ticket: PrintableTicket }) {
  const priceLabel =
    ticket.tierPrice != null ? formatCurrency(ticket.tierPrice) : null

  return (
    <div className="print-ticket mx-auto max-w-[300px] bg-white p-2 text-center text-black">
      <article className="overflow-hidden print:shadow-none">
        <div className="flex flex-col items-center gap-1 pb-2">
          <span className="size-10 overflow-hidden rounded-lg bg-black">
            <Image
              src={BRAND_MARK_SRC}
              alt="Tokepass"
              width={40}
              height={40}
              className="size-full object-cover"
              priority
            />
          </span>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">
            Tokepass
          </p>
        </div>

        <h1 className="text-base font-black leading-tight tracking-tight text-black">
          {ticket.eventTitle}
        </h1>

        <p className="mt-1 text-[11px] capitalize text-zinc-700">
          {formatEventDay(ticket.eventDate)}
          {" · "}
          {formatEventTime(ticket.eventDate)}
        </p>
        <p className="mt-0.5 text-[10px] leading-snug text-zinc-600">
          {ticket.eventLocation}
        </p>

        <div className="my-3 border-y border-dashed border-zinc-400 py-2">
          <p className="text-sm font-bold text-black">{ticket.tierName}</p>
          {priceLabel ? (
            <p className="mt-0.5 text-lg font-black tabular-nums text-black">
              {priceLabel}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-2 py-2">
          <div className="inline-block bg-white p-1">
            <QRCodeSVG
              value={ticket.qrPayload}
              size={220}
              level="H"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#000000"
              className="print-ticket-qr"
            />
          </div>
          <p className="font-mono text-[9px] tracking-wider text-zinc-500">
            #{ticket.id.slice(0, 8).toUpperCase()}
          </p>
        </div>

        <div className="mt-1 space-y-0.5 text-sm">
          <p className="font-semibold text-black">{ticket.holderName}</p>
          {ticket.holderDni ? (
            <p className="text-xs tabular-nums text-zinc-800">
              DNI {ticket.holderDni}
            </p>
          ) : null}
        </div>

        <p className="mt-3 text-[10px] font-medium leading-snug text-zinc-700">
          Conservar este ticket para el ingreso
        </p>
        <p className="mt-1 text-[9px] leading-snug text-zinc-500">
          El primer escaneo en puerta otorga el acceso.
        </p>
      </article>
    </div>
  )
}
